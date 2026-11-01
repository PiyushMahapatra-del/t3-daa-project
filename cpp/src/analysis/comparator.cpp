#include "../../include/optimizer.h"
#include <nlohmann/json.hpp>
#include <vector>

using json = nlohmann::json;

// ── Run benchmark suite for multiple city counts ──────────────────────────
json runComparisons(const std::vector<int>& city_counts) {
    json results = json::array();
    for (int n : city_counts) {
        int stops = std::min(n - 1, 10); // up to 10 delivery stops
        BenchmarkResult r = benchmark(n, stops);
        json entry;
        entry["n_cities"]       = r.n_cities;
        entry["n_stops"]        = stops;
        entry["greedy_cost"]    = r.greedy_cost;
        entry["two_opt_cost"]   = r.two_opt_cost;
        entry["dp_cost"]        = r.dp_cost;
        entry["greedy_ms"]      = r.greedy_time_ms;
        entry["two_opt_ms"]     = r.two_opt_time_ms;
        entry["dp_ms"]          = r.dp_time_ms;
        // improvement percentages
        double imp_2opt = (r.greedy_cost > 0)
            ? 100.0 * (r.greedy_cost - r.two_opt_cost) / r.greedy_cost : 0.0;
        entry["improvement_2opt_pct"] = imp_2opt;
        if (r.dp_cost > 0) {
            double imp_dp = 100.0 * (r.greedy_cost - r.dp_cost) / r.greedy_cost;
            entry["improvement_dp_pct"] = imp_dp;
        } else {
            entry["improvement_dp_pct"] = nullptr;
        }
        results.push_back(entry);
    }
    return results;
}
