# 📦 Delivery Optimizer

An intelligent logistics platform built in **C++** (algorithms) + **Flask** (web server) + **Vanilla JS** (UI).

## Features

| Module | Algorithm | Member |
|--------|-----------|--------|
| Order Management + Driver Assignment | Priority Queue (Heap), Greedy | Member 1 |
| City Graph + Shortest Path | Dijkstra's Algorithm | Member 2 |
| TSP Route Planning | Nearest Neighbor + 2-Opt | Member 2 |
| Exact TSP (≤12 stops) | Held-Karp DP | Member 3 |
| Package Packing | 0/1 Knapsack DP | Member 3 |
| Algorithm Comparison | Benchmarking (5,10,20,50 cities) | Member 3 |

## Quick Start (Windows)

### Prerequisites
- [CMake ≥ 3.14](https://cmake.org/download/)
- [MinGW-w64 (g++)](https://winlibs.com/) — add to PATH
- [Python ≥ 3.9](https://python.org)

### Steps
```bat
# 1. Clone repo
git clone https://github.com/<your-org>/delivery-optimizer.git
cd delivery-optimizer

# 2. Build C++ binary
build.bat

# 3. Launch web server
run.bat
```
Open [http://localhost:5000](http://localhost:5000) in your browser.

## Project Structure

```
delivery-optimizer/
├── cpp/
│   ├── include/          # Shared headers (Order, Driver, Graph, Optimizer)
│   ├── src/
│   │   ├── core/         # Member 1: Order manager, priority queue, driver assignment
│   │   ├── routing/      # Member 2: Graph, Dijkstra, TSP heuristics
│   │   └── analysis/     # Member 3: Benchmark, DP comparator, Knapsack
│   ├── main.cpp          # CLI entry point (called by Flask)
│   └── CMakeLists.txt
├── templates/
│   └── index.html        # Full dashboard UI
├── static/
│   ├── css/style.css
│   └── js/app.js
├── app.py                # Flask backend
├── build.bat             # Windows build script
├── run.bat               # Launch script
└── requirements.txt
```

## Tabs / Modules

1. **City Map** — Generate random weighted city graph with N cities
2. **Routing** — Dijkstra shortest path + TSP multi-stop planner (3 algorithms)
3. **Orders** — Add orders, add drivers, run greedy assignment with priority queue
4. **Benchmark** — Compare Greedy / 2-Opt / DP across city counts with charts
5. **Knapsack** — DP-optimal package selection for vehicle capacity

## Algorithm Details

- **Dijkstra**: Min-heap, O((V+E) log V)
- **TSP Nearest Neighbor**: Greedy heuristic, O(n²)
- **2-Opt**: Local search improvement, O(n²) per iteration
- **Held-Karp DP**: Exact TSP, O(2ⁿ · n²), practical up to ~15 stops
- **0/1 Knapsack DP**: O(n · W) where W = vehicle capacity
- **Greedy Driver Assignment**: Priority queue O(n log n) + greedy matching O(n · d)
