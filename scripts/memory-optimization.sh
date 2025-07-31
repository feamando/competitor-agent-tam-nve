#!/bin/bash

# Memory Optimization Startup Script
# Implementation for Task 1.1 - Address Memory Pressure Issues
# Date: July 29, 2025

set -e

echo "=== Memory Optimization Startup Script ==="
echo "Task 1.1: Address Memory Pressure Issues"
echo "Date: $(date)"
echo

# Memory configuration as per task 1.1
export NODE_OPTIONS="--expose-gc --max-old-space-size=8192"

echo "Memory Configuration:"
echo "  NODE_OPTIONS: $NODE_OPTIONS"
echo "  Max Old Space Size: 8192 MB"
echo "  Garbage Collection: Enabled"
echo

# Check current memory before starting
echo "=== System Memory Status ==="
echo "Total Memory: $(free -h | awk '/^Mem:/ { print $2 }')"
echo "Available Memory: $(free -h | awk '/^Mem:/ { print $7 }')"
echo "Used Memory: $(free -h | awk '/^Mem:/ { print $3 }')"
echo

# Set memory monitoring thresholds
export MEMORY_WARNING_THRESHOLD=85
export MEMORY_CRITICAL_THRESHOLD=95

echo "Memory Monitoring Thresholds:"
echo "  Warning Threshold: ${MEMORY_WARNING_THRESHOLD}%"
echo "  Critical Threshold: ${MEMORY_CRITICAL_THRESHOLD}%"
echo

# Function to monitor memory during startup
monitor_memory_startup() {
    echo "=== Monitoring Memory During Startup ==="
    
    # Wait a bit for application to start
    sleep 10
    
    # Check memory usage
    local memory_usage=$(free | awk '/^Mem:/ { printf "%.1f", ($3/$2) * 100 }')
    echo "Current memory usage: ${memory_usage}%"
    
    # Alert if memory usage is high during startup
    if (( $(echo "$memory_usage > $MEMORY_WARNING_THRESHOLD" | bc -l) )); then
        echo "WARNING: High memory usage detected during startup (${memory_usage}%)"
        echo "Consider investigating memory-intensive processes"
    fi
}

# Function to setup memory monitoring
setup_memory_monitoring() {
    echo "=== Setting up Memory Monitoring ==="
    
    # Create memory monitoring log directory
    mkdir -p logs/memory
    
    # Start background memory monitoring
    (
        while true; do
            timestamp=$(date '+%Y-%m-%d %H:%M:%S')
            memory_info=$(free | awk '/^Mem:/ { printf "%.1f", ($3/$2) * 100 }')
            echo "[$timestamp] Memory usage: ${memory_info}%" >> logs/memory/memory-monitor.log
            sleep 30
        done
    ) &
    
    # Store the PID for cleanup
    echo $! > logs/memory/monitor.pid
    echo "Memory monitoring started (PID: $!)"
}

# Function to cleanup monitoring on exit
cleanup_monitoring() {
    echo "=== Cleaning up Memory Monitoring ==="
    if [ -f logs/memory/monitor.pid ]; then
        local monitor_pid=$(cat logs/memory/monitor.pid)
        if kill -0 $monitor_pid 2>/dev/null; then
            kill $monitor_pid
            echo "Memory monitoring stopped (PID: $monitor_pid)"
        fi
        rm -f logs/memory/monitor.pid
    fi
}

# Setup cleanup trap
trap cleanup_monitoring EXIT INT TERM

echo "=== Starting Application with Memory Optimization ==="
echo "Command: $@"
echo

# Start memory monitoring in background
setup_memory_monitoring

# Start memory monitoring during startup in background
monitor_memory_startup &

# Execute the command passed to the script
exec "$@" 