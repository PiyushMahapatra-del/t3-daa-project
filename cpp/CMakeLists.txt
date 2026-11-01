cmake_minimum_required(VERSION 3.14)
project(delivery_optimizer CXX)
set(CMAKE_CXX_STANDARD 17)

# Release build for performance
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# ── nlohmann/json (header-only, fetch from GitHub) ────────────────────────
include(FetchContent)
FetchContent_Declare(
  json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
)
FetchContent_MakeAvailable(json)

# ── Sources ───────────────────────────────────────────────────────────────
set(SOURCES
    main.cpp
    src/routing/graph.cpp
    src/routing/dijkstra.cpp
    src/routing/tsp.cpp
    src/analysis/benchmark.cpp
    src/analysis/comparator.cpp
    # order_manager.cpp is header-included (class defined there)
)

add_executable(optimizer ${SOURCES})
target_include_directories(optimizer PRIVATE include)
target_link_libraries(optimizer PRIVATE nlohmann_json::nlohmann_json)

# Output to bin/ folder (one level up from cpp/)
set_target_properties(optimizer PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../bin"
)
