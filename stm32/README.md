# STM32 Firmware

STM32F767ZI microcontroller firmware for the Rocket Control System.

## Hardware Configuration

- **MCU**: STM32F767ZI (ARM Cortex-M7 @ 216 MHz)
- **Flash**: 2 MB
- **RAM**: 512 KB
- **UART**: USART3 @ 230400 baud
- **ADC Channels**:
  - ADC2: 12 channels (pressure sensors P1-P8 + 4 additional)
  - ADC3: 7 channels (temperature sensors T1-T6 + Tbogaz1)
- **GPIO**: 9 solenoid valve control outputs
- **DMA**: Direct Memory Access for high-speed ADC sampling

## Project Structure

The main STM32 project is located in `../stm32_firmware/` directory (STM32CubeIDE project).

## Communication Protocol

### UART Communication
- **Baud Rate**: 230400
- **Data Format**: 8N1 (8 data bits, no parity, 1 stop bit)
- **Protocol**: Custom text-based protocol

### Data Format

#### Sensor Data Output
```
P1: 12.5 | P2: 15.3 | P3: 18.2 | P4: 20.1 | P5: 22.5 | P6: 25.0 | P7: 28.3 | P8: 30.1 | T1: 25.0 | T2: 27.5 | T3: 30.0 | T4: 32.5 | T5: 35.0 | T6: 37.5 | Tbogaz1: 1200.5 | THRUST: 1250.5 | ISP: 285.3 | Tbogaz2: 1300.2 | D1: 15.5 | D2: 12.3 | IMPULSE: 50000.0 | VELOCITY: 2500.0
```

#### Valve Control Input
```
Valves:010010110\n
```
- Format: `Valves:` followed by 9 digits (0 or 1)
- Each digit represents a valve state (0=closed, 1=open)
- Example: `Valves:010010110` means valves 2, 5, 7, 8 are open

#### Scenario Commands
```
o2cleaning\n
fuelcleaning\n
preburning\n
burningstart\n
burning\n
emergency\n
```

## Development

### Prerequisites
- STM32CubeIDE
- STM32CubeMX (for configuration)
- ST-Link programmer/debugger

### Building
1. Open `stm32_firmware/usartsal.ioc` in STM32CubeMX
2. Generate code
3. Open project in STM32CubeIDE
4. Build project (Project > Build All)

### Flashing
1. Connect STM32 via ST-Link
2. In STM32CubeIDE: Run > Debug (or Run > Run)
3. Firmware will be flashed automatically

## Features

- **High-Frequency ADC Sampling**: 10kHz sampling rate using DMA
- **Real-time Calculations**: Thrust, ISP, Total Impulse computed on MCU
- **Valve Control**: 9 independent solenoid valve outputs
- **UART Communication**: Non-blocking interrupt-driven communication
- **Watchdog Support**: Hardware watchdog for system reliability

## Pin Configuration

See `stm32_firmware/usartsal.ioc` for complete pin configuration.

Key pins:
- **USART3**: PC10 (TX), PC11 (RX)
- **ADC2**: Multiple channels for pressure sensors
- **ADC3**: Multiple channels for temperature sensors
- **GPIO**: 9 pins for solenoid valve control

## Troubleshooting

### UART Communication Issues
- Verify baud rate: 230400
- Check TX/RX pin connections
- Verify UART settings (8N1)

### ADC Reading Issues
- Check DMA configuration
- Verify ADC channel assignments
- Check sensor connections

### Valve Control Issues
- Verify GPIO pin configuration
- Check solenoid power supply
- Verify valve command format
