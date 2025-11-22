# Backend - Rocket Control System

FastAPI-based backend server for real-time rocket propulsion system control and monitoring.

## Architecture

- **Framework**: FastAPI 0.104+ (Async Python web framework)
- **WebSocket**: Native async WebSocket support
- **Serial Communication**: PySerial 3.5 (UART)
- **Data Processing**: NumPy, Pandas
- **Serialization**: MessagePack (binary protocol)

## Features

- **Real-time Sensor Data Acquisition**: 10kHz sampling rate
- **WebSocket Communication**: MessagePack-optimized binary protocol
- **Hardware Integration**: STM32F767ZI and Arduino Uno communication
- **Data Buffering**: Efficient NumPy-based circular buffer (6M samples)
- **Parquet Export**: Automatic data logging with compression
- **Multi-client Support**: Concurrent WebSocket connections

## Project Structure

```
backend/
├── hardware/
│   └── arduino.py          # Arduino UART communication
├── raspberry_pi_backend.py # Production backend (Raspberry Pi)
├── main.py                 # Development backend (Windows)
├── simulation.py           # Sensor data simulator
├── analyze_parquet_plot.py # Data analysis tool
├── create_test_parquet.py  # Test data generator
└── requirements.txt        # Python dependencies
```

## Installation

### Prerequisites
- Python 3.8+
- pip

### Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# For Raspberry Pi (ARM optimization)
pip install -r ../pi_requirements.txt
```

## Usage

### Development (Windows)

```bash
python main.py
```

Server runs on `http://localhost:5001`

### Production (Raspberry Pi)

```bash
python raspberry_pi_backend.py
```

Server runs on `http://0.0.0.0:5001` (accessible from network)

## Configuration

### UART Settings

Edit `raspberry_pi_backend.py` or `main.py`:

```python
STM32_BAUDRATE = 230400
ARDUINO_BAUDRATE = 115200
```

### Buffer Configuration

```python
BUFFER_SIZE = 10_000 * 60 * 10  # 6M samples (10 minutes @ 10kHz)
AUTO_SAVE_INTERVAL = 10000      # Auto-save every 10k samples
WEBSOCKET_THROTTLE = 3          # Send every 3rd sample
```

## API Endpoints

### REST API

- `GET /api/hello` - Health check
- `GET /api/status` - System status
- `GET /api/sensors` - Current sensor data
- `POST /api/valves` - Control valves
- `POST /api/step_motor` - Control step motors
- `POST /api/scenario/{name}` - Execute scenario
- `POST /api/save_sensor_buffer` - Save buffer to Parquet
- `GET /api/buffer_status` - Buffer status
- `GET /api/parquet_files` - List Parquet files
- `GET /api/parquet_data/{filename}` - Get Parquet data

### WebSocket

- `ws://localhost:5001/ws` - Real-time communication

**Message Types**:
- `valve_command` - Control valves
- `step_motor_command` - Control step motors
- `get_sensors` - Request sensor data
- `system_mode` - Change system mode

## Hardware Communication

### STM32F767ZI
- **Port**: Auto-detected (`/dev/ttyACM*` or `COM*`)
- **Baud Rate**: 230400
- **Protocol**: Custom text-based (see `../stm32/protocol.md`)

### Arduino Uno
- **Port**: Auto-detected (`/dev/ttyUSB*` or `COM*`)
- **Baud Rate**: 115200
- **Protocol**: Text commands (`motor_id:angle\n`)

## Data Management

### Buffer System
- **Type**: NumPy circular buffer
- **Size**: 6 million samples
- **Format**: float32 (sensors), float64 (timestamps)
- **Memory**: ~184 MB

### Parquet Export
- **Format**: Apache Parquet (columnar)
- **Compression**: Snappy
- **Auto-save**: Every 10k samples + 120s intervals
- **Location**: Current directory (`sensor_log_*.parquet`)

## Performance

- **Sampling Rate**: 10,000 Hz
- **WebSocket Latency**: < 10 ms
- **MessagePack Efficiency**: 60% smaller than JSON
- **Update Rate**: 3.3kHz (throttled)

## Development

### Testing

```bash
# Test WebSocket
python ../tests/test_msgpack_websocket.py

# Test sensor mapping
python ../tests/test_sensor_mapping.py

# Create test data
python create_test_parquet.py
```

### Debugging

Enable debug logging:

```python
logging.basicConfig(level=logging.DEBUG)
```

## Troubleshooting

### Hardware Not Detected
- Check USB connections
- Verify port permissions (Linux: `sudo usermod -a -G dialout $USER`)
- Check baud rates match firmware

### Buffer Overflow
- Reduce `BUFFER_SIZE` if RAM limited
- Increase `AUTO_SAVE_INTERVAL`
- Check disk space for Parquet files

### WebSocket Issues
- Verify CORS settings
- Check firewall (port 5001)
- Test with `test_websocket.ps1`
