// dijkstra.cpp — exposes dijkstra as a standalone callable for the main entry point
// The actual implementation lives in graph.cpp via Graph::dijkstra()
// This file provides utility wrappers used by main.cpp

#include "../../include/graph.h"
#include <nlohmann/json.hpp>
#include <vector>
#include <string>

using json = nlohmann::json;

// Return JSON with path nodes, names, total cost
json shortestPathJson(const Graph& g, int src, int dst) {
    auto path = g.dijkstraPath(src, dst);
    auto dists = g.dijkstra(src);

    json result;
    result["src"] = src;
    result["dst"] = dst;
    result["src_name"] = g.city_names[src];
    result["dst_name"] = g.city_names[dst];
    result["cost"] = (dists[dst] == INF) ? -1.0 : dists[dst];
    result["reachable"] = (dists[dst] != INF);

    json path_arr = json::array();
    for (int node : path) {
        path_arr.push_back({
            {"id",   node},
            {"name", g.city_names[node]},
            {"x",    g.x_coords[node]},
            {"y",    g.y_coords[node]}
        });
    }
    result["path"] = path_arr;
    return result;
}

// All-pairs shortest path distances (for small graphs)
json allPairsJson(const Graph& g) {
    json matrix = json::array();
    for (int i = 0; i < g.n; i++) {
        auto dists = g.dijkstra(i);
        json row = json::array();
        for (int j = 0; j < g.n; j++)
            row.push_back(dists[j] == INF ? -1.0 : dists[j]);
        matrix.push_back(row);
    }
    return matrix;
}
