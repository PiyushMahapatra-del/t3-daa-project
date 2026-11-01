#include "../../include/graph.h"
#include "../../include/optimizer.h"
#include <vector>
#include <algorithm>
#include <limits>
#include <numeric>

// ── TSP Nearest Neighbor Heuristic ────────────────────────────────────────
std::vector<int> tspNearestNeighbor(const Graph& g, int start, const std::vector<int>& stops) {
    if (stops.empty()) return {start};

    std::vector<bool> visited(stops.size(), false);
    std::vector<int> tour = {start};
    int cur = start;

    for (int iter = 0; iter < (int)stops.size(); iter++) {
        auto dists = g.dijkstra(cur);
        double best = INF;
        int best_idx = -1;
        for (int i = 0; i < (int)stops.size(); i++) {
            if (!visited[i] && dists[stops[i]] < best) {
                best = dists[stops[i]];
                best_idx = i;
            }
        }
        if (best_idx == -1) break;
        visited[best_idx] = true;
        tour.push_back(stops[best_idx]);
        cur = stops[best_idx];
    }
    tour.push_back(start); // return to depot
    return tour;
}

// ── 2-opt local search improvement ────────────────────────────────────────
std::vector<int> twoOpt(const Graph& g, std::vector<int> tour) {
    bool improved = true;
    while (improved) {
        improved = false;
        for (int i = 1; i < (int)tour.size() - 2; i++) {
            for (int j = i + 1; j < (int)tour.size() - 1; j++) {
                // Cost before: edge(i-1,i) + edge(j,j+1)
                double before = g.dijkstra(tour[i-1])[tour[i]] +
                                g.dijkstra(tour[j])[tour[j+1]];
                // Cost after swap: edge(i-1,j) + edge(i,j+1)
                double after  = g.dijkstra(tour[i-1])[tour[j]] +
                                g.dijkstra(tour[i])[tour[j+1]];
                if (after < before - 1e-9) {
                    std::reverse(tour.begin() + i, tour.begin() + j + 1);
                    improved = true;
                }
            }
        }
    }
    return tour;
}

// ── Exact TSP via DP (Held-Karp) — only for small instances ≤15 stops ─────
std::vector<int> tspDP(const Graph& g, int start, const std::vector<int>& stops) {
    int m = stops.size();
    if (m == 0) return {start};
    if (m > 15) return {}; // too large, caller should use heuristic

    // Precompute shortest distances between all relevant nodes
    std::vector<int> nodes = {start};
    nodes.insert(nodes.end(), stops.begin(), stops.end());
    int N = nodes.size(); // N = m+1

    // dist[i][j] = shortest path from nodes[i] to nodes[j]
    std::vector<std::vector<double>> dist(N, std::vector<double>(N, INF));
    for (int i = 0; i < N; i++) {
        auto d = g.dijkstra(nodes[i]);
        for (int j = 0; j < N; j++)
            dist[i][j] = d[nodes[j]];
    }

    // dp[S][i] = min cost to visit subset S starting from depot (node 0) ending at i
    // S is a bitmask over stops (indices 1..m in nodes[])
    int FULL = (1 << m) - 1;
    std::vector<std::vector<double>> dp(1 << m, std::vector<double>(m, INF));
    std::vector<std::vector<int>>    parent(1 << m, std::vector<int>(m, -1));

    // Base: from depot (index 0) to each stop i (index i+1 in nodes[])
    for (int i = 0; i < m; i++) {
        dp[1 << i][i] = dist[0][i + 1];
    }

    for (int S = 1; S <= FULL; S++) {
        for (int i = 0; i < m; i++) {
            if (!(S & (1 << i))) continue;
            if (dp[S][i] == INF) continue;
            for (int j = 0; j < m; j++) {
                if (S & (1 << j)) continue;
                int S2 = S | (1 << j);
                double nd = dp[S][i] + dist[i + 1][j + 1];
                if (nd < dp[S2][j]) {
                    dp[S2][j] = nd;
                    parent[S2][j] = i;
                }
            }
        }
    }

    // Find best last stop (return to depot)
    double best = INF;
    int last = -1;
    for (int i = 0; i < m; i++) {
        double cost = dp[FULL][i] + dist[i + 1][0];
        if (cost < best) { best = cost; last = i; }
    }
    if (last == -1) return {};

    // Reconstruct path
    std::vector<int> order;
    int S = FULL, cur = last;
    while (cur != -1) {
        order.push_back(stops[cur]);
        int prev = parent[S][cur];
        S ^= (1 << cur);
        cur = prev;
    }
    std::reverse(order.begin(), order.end());

    std::vector<int> tour = {start};
    tour.insert(tour.end(), order.begin(), order.end());
    tour.push_back(start);
    return tour;
}
