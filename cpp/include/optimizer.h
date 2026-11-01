#pragma once
#include "graph.h"
#include <vector>

// TSP nearest-neighbor heuristic
std::vector<int> tspNearestNeighbor(const Graph& g, int start, const std::vector<int>& stops);

// 2-opt improvement on a TSP tour
std::vector<int> twoOpt(const Graph& g, std::vector<int> tour);

// DP for subset of stops (exact, up to ~15 nodes)
std::vector<int> tspDP(const Graph& g, int start, const std::vector<int>& stops);

struct BenchmarkResult {
    int n_cities;
    double greedy_cost;
    double two_opt_cost;
    double dp_cost;          // -1 if skipped (too large)
    double greedy_time_ms;
    double two_opt_time_ms;
    double dp_time_ms;
};

BenchmarkResult benchmark(int n_cities, int n_stops);
