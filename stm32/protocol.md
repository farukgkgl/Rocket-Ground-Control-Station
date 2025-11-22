# STM32 Communication Protocol

## Overview

This document describes the communication protocol between the STM32F767ZI microcontroller and the backend server.

## UART Configuration

- **Baud Rate**: 230400
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **Flow Control**: None

## Message Format

### Sensor Data (STM32 → Backend)

STM32 continuously sends sensor data in the following format:

```
P1: 12.5 | P2: 15.3 | P3: 18.2 | P4: 20.1 | P5: 22.5 | P6: 25.0 | P7: 28.3 | P8: 30.1 | T1: 25.0 | T2: 27.5 | T3: 30.0 | T4: 32.5 | T5: 35.0 | T6: 37.5 | Tbogaz1: 1200.5 | THRUST: 1250.5 | ISP: 285.3 | Tbogaz2: 1300.2 | D1: 15.5 | D2: 12.3 | IMPULSE: 50000.0 | VELOCITY: 2500.0
```

**Format**: `KEY: VALUE | KEY: VALUE | ...`

**Fields**:
- `P1-P8`: Pressure sensors (bar)
- `T1-T6`: Temperature sensors (°C)
- `Tbogaz1`, `Tbogaz2`: Exhaust temperature sensors (°C)
- `THRUST`: Calculated thrust (N)
- `ISP`: Specific Impulse (s)
- `D1`: Oxygen consumption rate (kg/s)
- `D2`: Fuel consumption rate (kg/s)
- `IMPULSE`: Total impulse (Ns)
- `VELOCITY`: Exhaust velocity (m/s)

**Frequency**: ~10kHz (100 samples per second)

### Valve Control (Backend → STM32)

```
Valves:010010110\n
```

**Format**: `Valves:` followed by 9 digits (0 or 1), terminated with `\n`

**Valve Mapping**:
- Position 0: RELIEF1
- Position 1: GOX1
- Position 2: PURGE1
- Position 3: PURGE2
- Position 4: FUEL1
- Position 5: RELIEF2
- Position 6: GOX2
- Position 7: FUEL2
- Position 8: IGNITION

**Example**: `Valves:010010110` means:
- RELIEF1: Closed (0)
- GOX1: Open (1)
- PURGE1: Closed (0)
- PURGE2: Closed (0)
- FUEL1: Open (1)
- RELIEF2: Closed (0)
- GOX2: Open (1)
- FUEL2: Open (1)
- IGNITION: Closed (0)

### Scenario Commands (Backend → STM32)

```
o2cleaning\n
fuelcleaning\n
preburning\n
burningstart\n
burning\n
emergency\n
```

**Format**: Command name followed by `\n`

**Commands**:
- `o2cleaning`: Oxygen cleaning sequence
- `fuelcleaning`: Fuel cleaning sequence
- `preburning`: Pre-burning sequence
- `burningstart`: Burning start sequence
- `burning`: Main burning sequence
- `emergency`: Emergency shutdown sequence

## Error Handling

### Timeout
- If no data received for 5 seconds, backend assumes connection lost
- Automatic reconnection attempt

### Invalid Data
- Backend ignores malformed sensor data
- Logs warning for debugging

### Command Acknowledgment
- STM32 may send acknowledgment messages (optional)
- Format: `ACK: command_name` or `NACK: error_message`

## Implementation Notes

### Backend Parsing
The backend uses regex pattern matching to parse sensor data:

```python
pattern = (
    r'P1:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*P2:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*...'
)
```

### STM32 Implementation
- Use `HAL_UART_Transmit()` for sending data
- Use `HAL_UART_Receive_IT()` for receiving commands
- Implement command parsing in UART interrupt callback

## Example Communication Flow

1. **Backend sends valve command**:
   ```
   Valves:010010110\n
   ```

2. **STM32 processes command** and updates GPIO outputs

3. **STM32 continues sending sensor data**:
   ```
   P1: 12.5 | P2: 15.3 | ...
   ```

4. **Backend parses and processes** sensor data

5. **Backend broadcasts** to WebSocket clients

