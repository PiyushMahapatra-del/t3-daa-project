#pragma once
#include <vector>
#include <string>
#include <limits>

const double INF = std::numeric_limits<double>::infinity();

struct Edge {
    int to;
    double weight;
};

class Graph {
public:
    int n;
    std::vector<std::string> city_names;
    std::vector<std::vector<Edge>> adj;
    std::vector<double> x_coords; // for visualization
    std::vector<double> y_coords;

    Graph(int n);
    void addEdge(int u, int v, double w);
    std::vector<double> dijkstra(int src) const;
    std::vector<int> dijkstraPath(int src, int dst) const;
    double pathCost(const std::vector<int>& path) const;
};
