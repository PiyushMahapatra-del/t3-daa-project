#pragma once
#include <string>

enum class Priority { LOW = 0, NORMAL = 1, URGENT = 2 };
enum class Status { PENDING, ASSIGNED, IN_TRANSIT, DELIVERED };

struct Order {
    int id;
    int src;          // source city index
    int dst;          // destination city index
    int weight;       // package weight in kg
    Priority priority;
    Status status;
    int driver_id;    // -1 if unassigned
    double distance;  // filled after routing

    std::string priorityStr() const {
        if (priority == Priority::URGENT) return "URGENT";
        if (priority == Priority::NORMAL) return "NORMAL";
        return "LOW";
    }
    std::string statusStr() const {
        if (status == Status::PENDING)    return "PENDING";
        if (status == Status::ASSIGNED)   return "ASSIGNED";
        if (status == Status::IN_TRANSIT) return "IN_TRANSIT";
        return "DELIVERED";
    }
};
