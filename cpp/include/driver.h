#pragma once
#include <string>
#include <vector>

struct Driver {
    int id;
    std::string name;
    int capacity;       // max weight (kg) this driver can carry
    int current_load;   // current load
    bool available;
    std::vector<int> assigned_orders;

    bool canTake(int weight) const {
        return available && (current_load + weight <= capacity);
    }
};
