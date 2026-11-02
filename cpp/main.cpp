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

// ── Real Indian cities (idx order = importance / geographic spread) ───────
struct IndiaCity { const char* name; const char* state; double lat, lng; };
static const IndiaCity INDIA[] = {
    {"Delhi","Delhi",28.6139,77.2090},{"Mumbai","Maharashtra",19.0760,72.8777},
    {"Bengaluru","Karnataka",12.9716,77.5946},{"Chennai","Tamil Nadu",13.0827,80.2707},
    {"Kolkata","West Bengal",22.5726,88.3639},{"Hyderabad","Telangana",17.3850,78.4867},
    {"Ahmedabad","Gujarat",23.0225,72.5714},{"Pune","Maharashtra",18.5204,73.8567},
    {"Jaipur","Rajasthan",26.9124,75.7873},{"Lucknow","Uttar Pradesh",26.8467,80.9462},
    {"Bhopal","Madhya Pradesh",23.2599,77.4126},{"Nagpur","Maharashtra",21.1458,79.0882},
    {"Chandigarh","Chandigarh",30.7333,76.7794},{"Patna","Bihar",25.5941,85.1376},
    {"Bhubaneswar","Odisha",20.2961,85.8245},{"Guwahati","Assam",26.1445,91.7362},
    {"Kochi","Kerala",9.9312,76.2673},{"Visakhapatnam","Andhra Pradesh",17.6868,83.2185},
    {"Indore","Madhya Pradesh",22.7196,75.8577},{"Surat","Gujarat",21.1702,72.8311},
    {"Kanpur","Uttar Pradesh",26.4499,80.3319},{"Coimbatore","Tamil Nadu",11.0168,76.9558},
    {"Vadodara","Gujarat",22.3072,73.1812},{"Amritsar","Punjab",31.6340,74.8723},
    {"Ranchi","Jharkhand",23.3441,85.3096},{"Raipur","Chhattisgarh",21.2514,81.6296},
    {"Dehradun","Uttarakhand",30.3165,78.0322},{"Jodhpur","Rajasthan",26.2389,73.0243},
    {"Madurai","Tamil Nadu",9.9252,78.1198},{"Thiruvananthapuram","Kerala",8.5241,76.9366},
    {"Mysuru","Karnataka",12.2958,76.6394},{"Panaji","Goa",15.4909,73.8278},
    {"Varanasi","Uttar Pradesh",25.3176,82.9739},{"Agra","Uttar Pradesh",27.1767,78.0081},
    {"Udaipur","Rajasthan",24.5854,73.7125},{"Srinagar","J&K",34.0837,74.7973},
    {"Shimla","Himachal Pradesh",31.1048,77.1734},{"Vijayawada","Andhra Pradesh",16.5062,80.6480},
    {"Mangaluru","Karnataka",12.9141,74.8560},{"Gwalior","Madhya Pradesh",26.2183,78.1828}
};
static const int INDIA_N = 40;

static double haversineKm(double la1, double lo1, double la2, double lo2) {
    const double R = 6371.0, D = 3.14159265358979323846 / 180.0;
    double dla = (la2 - la1) * D, dlo = (lo2 - lo1) * D;
    double a = std::sin(dla/2)*std::sin(dla/2) +
               std::cos(la1*D)*std::cos(la2*D)*std::sin(dlo/2)*std::sin(dlo/2);
    return 2 * R * std::asin(std::sqrt(a));
}

// ── Build the road network: first n Indian cities, k-nearest links ────────
// Edge weight = great-circle km x 1.3 (road factor), rounded to 0.1 km.
// Sparse so Dijkstra finds genuine multi-hop routes; always connected.
Graph buildGraph(int n, unsigned seed = 42) {
    (void)seed;
    n = std::max(2, std::min(n, INDIA_N));
    Graph g(n);
    for (int i = 0; i < n; i++) {
        g.city_names.push_back(INDIA[i].name);
        g.x_coords[i] = INDIA[i].lng;   // x = longitude
        g.y_coords[i] = INDIA[i].lat;   // y = latitude
    }
    std::vector<std::vector<double>> d(n, std::vector<double>(n, 0.0));
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            d[i][j] = std::round(haversineKm(INDIA[i].lat, INDIA[i].lng,
                                             INDIA[j].lat, INDIA[j].lng) * 1.3 * 10.0) / 10.0;

    std::vector<std::vector<bool>> has(n, std::vector<bool>(n, false));
    int k = std::min(3, n - 1);
    for (int i = 0; i < n; i++) {
        std::vector<int> order;
        for (int j = 0; j < n; j++) if (j != i) order.push_back(j);
        std::stable_sort(order.begin(), order.end(),
                         [&](int a, int b) { return d[i][a] < d[i][b]; });
        for (int t = 0; t < k; t++) { has[i][order[t]] = true; has[order[t]][i] = true; }
    }
    // connect components (union-find) with shortest bridging edges
    std::vector<int> comp(n);
    for (int i = 0; i < n; i++) comp[i] = i;
    auto find = [&](int x) { while (comp[x] != x) x = comp[x] = comp[comp[x]]; return x; };
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
            if (has[i][j]) comp[find(i)] = find(j);
    while (true) {
        double best = 1e18; int bi = -1, bj = -1;
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                if (find(i) != find(j) && d[i][j] < best) { best = d[i][j]; bi = i; bj = j; }
        if (bi < 0) break;
        has[bi][bj] = has[bj][bi] = true;
        comp[find(bi)] = find(bj);
    }
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
            if (has[i][j]) g.addEdge(i, j, d[i][j]);
    return g;
}

// ── Graph → JSON ──────────────────────────────────────────────────────────
json graphToJson(const Graph& g) {
    json nodes = json::array();
    for (int i = 0; i < g.n; i++)
        nodes.push_back({{"id",g.city_names[i]},{"idx",i},{"state",INDIA[i].state},
                         {"lat",g.y_coords[i]},{"lng",g.x_coords[i]},
                         {"x",g.x_coords[i]},{"y",g.y_coords[i]}});

    json edges = json::array();
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
        if (n > 40) n = 40;
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
