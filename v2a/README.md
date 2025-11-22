# Arduino Firmware

Arduino Uno firmware for step motor control and mechanical button interface.

## Hardware Configuration

- **Board**: Arduino Uno (ATmega328P @ 16 MHz)
- **Communication**: UART @ 115200 baud
- **Step Motors**: 2 motors (A4988/DRV8825 compatible drivers)
- **Mechanical Buttons**: 8 buttons (A0-A7 analog pins)

## Features

- **Step Motor Control**: 2 independent step motors with precise angle positioning
- **Mechanical Button Interface**: 8-button hardware override system
- **Relay Control**: Solenoid valve activation via relays
- **Command Processing**: Serial command parsing and execution

## Pin Configuration

### Step Motor 1
- **STEP_PIN**: 2
- **DIR_PIN**: 3
- **EN_PIN**: 4

### Step Motor 2
- **STEP_PIN**: 5
- **DIR_PIN**: 6
- **EN_PIN**: 7

### Mechanical Buttons
- **Button 1-8**: A0-A7 (analog pins, used as digital inputs with pull-up)

## Communication Protocol

### Step Motor Command
```
1:90\n
```
- Format: `motor_id:angle\n`
- `motor_id`: 1 or 2
- `angle`: Angle in degrees (positive = clockwise, negative = counterclockwise)
- Example: `1:90\n` rotates motor 1 by 90 degrees

### Button Control
- Buttons are read continuously
- Each button press toggles corresponding solenoid valve
- 50ms debounce to prevent false triggers

## Installation

1. Open `v2a.ino` in Arduino IDE
2. Select board: **Arduino Uno**
3. Select port: Your Arduino's COM port
4. Upload sketch

## Usage

### Step Motor Control
Send commands via serial:
```
1:90\n    # Rotate motor 1 by 90°
2:-180\n  # Rotate motor 2 by -180°
```

### Mechanical Buttons
- Press button to toggle corresponding solenoid
- Button state is sent to backend automatically
- Emergency mode disables button control

## Troubleshooting

### Motor Not Moving
- Check STEP, DIR, EN pin connections
- Verify motor driver power supply
- Check step delay settings

### Buttons Not Working
- Verify button connections (A0-A7 to buttons, GND to buttons)
- Check debounce delay settings
- Ensure button control is enabled in backend

### Serial Communication Issues
- Verify baud rate: 115200
- Check USB cable connection
- Restart Arduino and backend

## Code Structure

- **Setup**: Pin configuration and serial initialization
- **Loop**: Button reading and command processing
- **Step Motor Functions**: Angle calculation and stepping
- **Button Functions**: Debounce and state management

