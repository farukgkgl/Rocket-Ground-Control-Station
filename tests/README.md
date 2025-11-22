# Tests

This directory contains test scripts for the Rocket Control System.

## Test Scripts

### `test_button_control.py`
Tests mechanical button control functionality via Arduino.

**Usage:**
```bash
python tests/test_button_control.py
```

### `test_msgpack_performance.py`
Performance comparison between MessagePack and JSON serialization.

**Usage:**
```bash
python tests/test_msgpack_performance.py
```

### `test_msgpack_websocket.py`
Tests WebSocket communication with MessagePack encoding.

**Usage:**
```bash
python tests/test_msgpack_websocket.py
```

### `test_sensor_mapping.py`
Validates sensor data mapping and format changes.

**Usage:**
```bash
python tests/test_sensor_mapping.py
```

### `test_websocket.html`
Simple HTML page for testing WebSocket connections in a browser.

**Usage:**
Open `tests/test_websocket.html` in a web browser.

## Running All Tests

```bash
# From project root
python tests/test_button_control.py
python tests/test_msgpack_performance.py
python tests/test_msgpack_websocket.py
python tests/test_sensor_mapping.py
```

## Requirements

All test scripts require the backend to be running on `http://localhost:5001`.

Make sure to install test dependencies:
```bash
pip install websockets msgpack requests
```

