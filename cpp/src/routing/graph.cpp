#include "../../include/graph.h"
#include <queue>
#include <algorithm>

Graph::Graph(int n) : n(n), adj(n), x_coords(n), y_coords(n) {}

void Graph::addEdge(int u, int v, double w) {
    adj[u].push_back({v, w});
    adj[v].push_back({u, w});
}

// ── Dijkstra returning distance array from src ─────────────────────────────
std::vector<double> Graph::dijkstra(int src) const {
    std::vector<double> dist(n, INF);
    dist[src] = 0.0;
    // min-heap: (dist, node)
    std::priority_queue<std::pair<double,int>,
                        std::vector<std::pair<double,int>>,
                        std::greater<>> pq;
    pq.push({0.0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;
        for (auto& e : adj[u]) {
            double nd = dist[u] + e.weight;
            if (nd < dist[e.to]) {
                dist[e.to] = nd;
                pq.push({nd, e.to});
            }
        }
    }
    return dist;
}

// ── Dijkstra returning the actual path src→dst ────────────────────────────
std::vector<int> Graph::dijkstraPath(int src, int dst) const {
    std::vector<double> dist(n, INF);
    std::vector<int> prev(n, -1);
    dist[src] = 0.0;
    std::priority_queue<std::pair<double,int>,
                        std::vector<std::pair<double,int>>,
                        std::greater<>> pq;
    pq.push({0.0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;
        for (auto& e : adj[u]) {
            double nd = dist[u] + e.weight;
            if (nd < dist[e.to]) {
                dist[e.to] = nd;
                prev[e.to] = u;
                pq.push({nd, e.to});
            }
        }
    }
    // Reconstruct
    std::vector<int> path;
    if (dist[dst] == INF) return path;
    for (int cur = dst; cur != -1; cur = prev[cur])
        path.push_back(cur);
    std::reverse(path.begin(), path.end());
    return path;
}

double Graph::pathCost(const std::vector<int>& path) const {
    if (path.size() < 2) return 0.0;
    double total = 0.0;
    for (int i = 0; i + 1 < (int)path.size(); i++) {
        auto dists = dijkstra(path[i]);
        total += dists[path[i+1]];
    }
    return total;
}
