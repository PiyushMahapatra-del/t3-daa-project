#include "../../include/optimizer.h"
#include "../../include/graph.h"
#include <cmath>
#include <chrono>
#include <random>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// Build a random complete-ish graph with n cities
static Graph buildRandomGraph(int n, unsigned seed = 42) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<double> coord(0.0, 100.0);

    Graph g(n);
    for (int i = 0; i < n; i++) {
        g.city_names.push_back("C" + std::to_string(i));
        g.x_coords[i] = coord(rng);
        g.y_coords[i] = coord(rng);
    }

    // Euclidean edges between every pair (complete graph) - also finds distance between vertices
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            double dx = g.x_coords[i] - g.x_coords[j];
            double dy = g.y_coords[i] - g.y_coords[j];
            double w = std::sqrt(dx*dx + dy*dy);
            g.addEdge(i, j, w);
        }
    }
    return g;
}

//  Single benchmark run ( comparison between greedy - 2 opt - held karp ) 
BenchmarkResult benchmark(int n_cities, int n_stops) {
    BenchmarkResult res;
    res.n_cities = n_cities;
    res.dp_cost = -1;
    res.dp_time_ms = -1;

    auto g = buildRandomGraph(n_cities);

    // stops: first n_stops cities after depot (city 0)
    std::vector<int> stops;
    for (int i = 1; i <= n_stops && i < n_cities; i++)
        stops.push_back(i);

    //  Greedy nearest-neighbor 
    auto t0 = std::chrono::high_resolution_clock::now();
    auto tour_greedy = tspNearestNeighbor(g, 0, stops);
    auto t1 = std::chrono::high_resolution_clock::now();
    res.greedy_cost    = g.pathCost(tour_greedy);
    res.greedy_time_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

    //  2-opt improvement 
    auto t2 = std::chrono::high_resolution_clock::now();
    auto tour_2opt = twoOpt(g, tour_greedy);
    auto t3 = std::chrono::high_resolution_clock::now();
    res.two_opt_cost    = g.pathCost(tour_2opt);
    res.two_opt_time_ms = std::chrono::duration<double, std::milli>(t3 - t2).count();

    // ── Exact DP (only for small instances) also known as Held-Karp algo 
    if ((int)stops.size() <= 12) {
        auto t4 = std::chrono::high_resolution_clock::now();
        auto tour_dp = tspDP(g, 0, stops);
        auto t5 = std::chrono::high_resolution_clock::now();
        res.dp_cost    = tour_dp.empty() ? -1.0 : g.pathCost(tour_dp);
        res.dp_time_ms = std::chrono::duration<double, std::milli>(t5 - t4).count();
    }

    return res;
}

//  DP Knapsack: pack orders into a vehicle optimally ( backtracking + dynamic programming) 
// Returns JSON with selected order indices and total value
json knapsackDP(const std::vector<int>& weights,
                const std::vector<int>& values,
                int capacity) {
    int n = weights.size();
    // dp[i][w] = max value using first i items with capacity w
    std::vector<std::vector<int>> dp(n + 1, std::vector<int>(capacity + 1, 0));
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= capacity; w++) {
            dp[i][w] = dp[i-1][w];
            if (weights[i-1] <= w)
                dp[i][w] = std::max(dp[i][w], dp[i-1][w - weights[i-1]] + values[i-1]);
        }
    }
    // Traceback
    std::vector<int> selected;
    int w = capacity;
    for (int i = n; i > 0; i--) {
        if (dp[i][w] != dp[i-1][w]) {
            selected.push_back(i - 1);
            w -= weights[i-1];
        }
    }
    std::reverse(selected.begin(), selected.end());

    json res;
    res["max_value"]    = dp[n][capacity];
    res["selected"]     = selected;
    res["total_weight"] = capacity - w;
    return res;
}
