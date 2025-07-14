#!/bin/bash

# Test Server Manager Script
# Purpose: Reliably start/stop Next.js dev server for testing

set -e

# Configuration
PORT=3000
PID_FILE=".next/test-server.pid"
LOG_FILE="logs/test-server.log"
MAX_WAIT=60  # Maximum seconds to wait for server start

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to check if server is running
check_server() {
    curl -s "http://localhost:$PORT" > /dev/null 2>&1
    return $?
}

# Function to start server
start_server() {
    echo "🚀 Starting test server on port $PORT..."
    
    # Check if server is already running
    if check_server; then
        echo "✅ Server already running on port $PORT"
        return 0
    fi
    
    # Start server in background
    npm run dev > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    echo $SERVER_PID > "$PID_FILE"
    
    echo "📝 Server PID: $SERVER_PID (saved to $PID_FILE)"
    echo "📄 Logs: $LOG_FILE"
    
    # Wait for server to be ready
    echo "⏳ Waiting for server to start..."
    for i in $(seq 1 $MAX_WAIT); do
        if check_server; then
            echo "✅ Test server ready at http://localhost:$PORT"
            return 0
        fi
        echo "   Attempt $i/$MAX_WAIT - waiting..."
        sleep 1
    done
    
    echo "❌ Server failed to start within $MAX_WAIT seconds"
    stop_server
    exit 1
}

# Function to stop server
stop_server() {
    echo "🛑 Stopping test server..."
    
    # Kill by PID file if it exists
    if [ -f "$PID_FILE" ]; then
        SERVER_PID=$(cat "$PID_FILE")
        if kill -0 $SERVER_PID 2>/dev/null; then
            kill $SERVER_PID
            echo "✅ Stopped server (PID: $SERVER_PID)"
        fi
        rm -f "$PID_FILE"
    fi
    
    # Also kill any lingering Next.js processes
    pkill -f "next dev" || true
    
    # Wait a moment for cleanup
    sleep 2
    
    if check_server; then
        echo "⚠️  Server still responding - forcing shutdown..."
        lsof -ti:$PORT | xargs kill -9 || true
        sleep 1
    fi
    
    echo "✅ Test server stopped"
}

# Function to restart server
restart_server() {
    stop_server
    sleep 2
    start_server
}

# Function to check server status
status_server() {
    if check_server; then
        echo "✅ Test server is running at http://localhost:$PORT"
        if [ -f "$PID_FILE" ]; then
            echo "📝 PID: $(cat $PID_FILE)"
        fi
    else
        echo "❌ Test server is not running"
        exit 1
    fi
}

# Main command handling
case "${1:-}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        status_server
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the test server"
        echo "  stop    - Stop the test server"
        echo "  restart - Restart the test server"
        echo "  status  - Check server status"
        exit 1
        ;;
esac 