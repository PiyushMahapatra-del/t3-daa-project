/*
 * main.cpp — Delivery Optimizer CLI
 * Flask calls this binary with a JSON payload on stdin,
 * reads JSON output from stdout.
 *
 * Commands (first argv[1]):
 *   generate    — build random city graph and return it
 *   shortest    — dijkstra src→dst
 *   tsp         — TSP tour for a list of stops
 *   assign      — greedy driver assignment
 *   benchmark   — compare algorithms for several city counts
 *   knapsack    — DP knapsack for packing orders
 */

#include "include/graph.h"
#include "include/optimizer.h"
#include "include/order.h"
#include "include/driver.h"
#include <nlohmann/json.hpp>

#include <iostream>
#include <string>
#include <cmath>
#include <random>
#include <sstream>
#include <algorithm>

using json = nlohmann::json;

// ── Forward declarations from other translation units ─────────────────────
json shortestPathJson(const Graph& g, int src, int dst);
json allPairsJson(const Graph& g);
json knapsackDP(const std::vector<int>& weights,
                const std::vector<int>& values,
                int capacity);
json runComparisons(const std::vector<int>& city_counts);

// ── City names pool ────────────────────────────────────────────────────────
static const std::vector<std::string> CITY_POOL = {
    "Alpha","Bravo","Charlie","Delta","Echo","Foxtrot","Golf","Hotel",
    "India","Juliet","Kilo","Lima","Mike","November","Oscar","Papa",
    "Quebec","Romeo","Sierra","Tango","Uniform","Victor","Whiskey",
    "X-Ray","Yankee","Zulu","Apex","Beacon","Crest","Dune","Eden",
    "Frost","Grove","Haven","Isle","Junction","Knox","Lakeview","Mesa",
    "Nexus","Orbit","Peak","Quay","Ridge","Summit","Tide","Upland",
    "Vale","Wharf","Zenith","Ardent"
};

// ── Build a random graph ──────────────────────────────────────────────────
Graph buildGraph(int n, unsigned seed = 42) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<double> coord(50.0, 750.0);

    Graph g(n);
    for (int i = 0; i < n; i++) {
        g.city_names.push_back(CITY_POOL[i % CITY_POOL.size()]);
        g.x_coords[i] = coord(rng);
        g.y_coords[i] = coord(rng);
    }

    // Euclidean edges — complete graph
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            double dx = g.x_coords[i] - g.x_coords[j];
            double dy = g.y_coords[i] - g.y_coords[j];
            double w  = std::round(std::sqrt(dx*dx + dy*dy) * 10.0) / 10.0;
            g.addEdge(i, j, w);
        }
    }
    return g;
}

// ── Graph → JSON ──────────────────────────────────────────────────────────
json graphToJson(const Graph& g) {
    json nodes = json::array();
    for (int i = 0; i < g.n; i++)
        nodes.push_back({{"id",g.city_names[i]},{"idx",i},
                         {"x",g.x_coords[i]},{"y",g.y_coords[i]}});

    json edges = json::array();
    std::vector<std::pair<int,int>> seen;
    for (int u = 0; u < g.n; u++) {
        for (auto& e : g.adj[u]) {
            if (u < e.to)
                edges.push_back({{"from",u},{"to",e.to},{"weight",e.weight}});
        }
    }
    return {{"nodes", nodes}, {"edges", edges}, {"n", g.n}};
}

// ─────────────────────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << json{{"error","no command given"}}.dump() << "\n";
        return 1;
    }
    std::string cmd = argv[1];

    // Read JSON from stdin
    json inp;
    try {
        std::cin >> inp;
    } catch (...) {
        inp = json::object();
    }

    // ── generate ──────────────────────────────────────────────────────────
    if (cmd == "generate") {
        int n    = inp.value("n", 10);
        int seed = inp.value("seed", 42);
        if (n < 2) n = 2;
        if (n > 50) n = 50;
        auto g = buildGraph(n, seed);
        std::cout << graphToJson(g).dump() << "\n";
        return 0;
    }

    // ── shortest ──────────────────────────────────────────────────────────
    if (cmd == "shortest") {
        int n    = inp.value("n", 10);
        int seed = inp.value("seed", 42);
        int src  = inp.value("src", 0);
        int dst  = inp.value("dst", 1);
        auto g = buildGraph(n, seed);
        src = std::clamp(src, 0, n-1);
        dst = std::clamp(dst, 0, n-1);
        std::cout << shortestPathJson(g, src, dst).dump() << "\n";
        return 0;
    }

    // ── tsp ───────────────────────────────────────────────────────────────
    if (cmd == "tsp") {
        int n    = inp.value("n", 10);
        int seed = inp.value("seed", 42);
        int depot= inp.value("depot", 0);
        std::vector<int> stops = inp.value("stops", std::vector<int>{});
        std::string algo = inp.value("algo", "greedy"); // greedy | 2opt | dp
        auto g = buildGraph(n, seed);

        // Filter invalid stops
        std::vector<int> valid_stops;
        for (int s : stops)
            if (s >= 0 && s < n && s != depot)
                valid_stops.push_back(s);

        std::vector<int> tour;
        double cost = 0.0;

        if (algo == "dp" && valid_stops.size() <= 12) {
            tour = tspDP(g, depot, valid_stops);
        } else {
            tour = tspNearestNeighbor(g, depot, valid_stops);
            if (algo == "2opt")
                tour = twoOpt(g, tour);
        }
        cost = g.pathCost(tour);

        json result;
        result["algo"] = algo;
        result["cost"] = cost;
        json tour_json = json::array();
        for (int t : tour)
            tour_json.push_back({{"idx",t},{"name",g.city_names[t]},
                                  {"x",g.x_coords[t]},{"y",g.y_coords[t]}});
        result["tour"] = tour_json;
        std::cout << result.dump() << "\n";
        return 0;
    }

    // ── assign ────────────────────────────────────────────────────────────
    if (cmd == "assign") {
        // Build orders and drivers from input JSON
        json orders_in  = inp.value("orders",  json::array());
        json drivers_in = inp.value("drivers", json::array());

        // Rebuild priority queue manually
        // Orders: [{src,dst,weight,priority}]
        // Drivers: [{name,capacity}]
        struct SimpleDriver { int id; std::string name; int cap; int load; };
        std::vector<SimpleDriver> drivers;
        int did = 1;
        for (auto& d : drivers_in)
            drivers.push_back({did++, d["name"], d["capacity"], 0});

        struct SimpleOrder {
            int id, src, dst, weight, priority;
            int driver_id = -1;
        };
        std::vector<SimpleOrder> orders;
        int oid = 1;
        for (auto& o : orders_in) {
            int p = 1;
            std::string ps = o.value("priority","NORMAL");
            if (ps == "URGENT") p = 2;
            else if (ps == "LOW") p = 0;
            orders.push_back({oid++, o["src"], o["dst"], o["weight"], p});
        }

        // Sort by priority descending
        std::sort(orders.begin(), orders.end(),
            [](const SimpleOrder& a, const SimpleOrder& b){ return a.priority > b.priority; });

        json assignments = json::array();
        for (auto& o : orders) {
            bool found = false;
            for (auto& d : drivers) {
                if (d.load + o.weight <= d.cap) {
                    d.load += o.weight;
                    o.driver_id = d.id;
                    std::string pstr = o.priority==2?"URGENT":o.priority==1?"NORMAL":"LOW";
                    assignments.push_back({
                        {"order_id",  o.id},
                        {"driver_id", d.id},
                        {"driver",    d.name},
                        {"priority",  pstr},
                        {"weight",    o.weight},
                        {"src",       o.src},
                        {"dst",       o.dst}
                    });
                    found = true;
                    break;
                }
            }
            if (!found) {
                std::string pstr = o.priority==2?"URGENT":o.priority==1?"NORMAL":"LOW";
                assignments.push_back({
                    {"order_id",  o.id},
                    {"driver_id", -1},
                    {"driver",    "UNASSIGNED"},
                    {"priority",  pstr},
                    {"weight",    o.weight},
                    {"src",       o.src},
                    {"dst",       o.dst}
                });
            }
        }

        json driver_summary = json::array();
        for (auto& d : drivers)
            driver_summary.push_back({{"id",d.id},{"name",d.name},
                                      {"capacity",d.cap},{"load",d.load}});
        std::cout << json{{"assignments",assignments},{"drivers",driver_summary}}.dump() << "\n";
        return 0;
    }

    // ── benchmark ─────────────────────────────────────────────────────────
    if (cmd == "benchmark") {
        std::vector<int> sizes = inp.value("sizes", std::vector<int>{5,10,20,50});
        std::cout << runComparisons(sizes).dump() << "\n";
        return 0;
    }

    // ── knapsack ──────────────────────────────────────────────────────────
    if (cmd == "knapsack") {
        std::vector<int> weights = inp.value("weights", std::vector<int>{});
        std::vector<int> values  = inp.value("values",  std::vector<int>{});
        int capacity             = inp.value("capacity", 100);
        std::cout << knapsackDP(weights, values, capacity).dump() << "\n";
        return 0;
    }

    std::cout << json{{"error","unknown command: " + cmd}}.dump() << "\n";
    return 1;
}
