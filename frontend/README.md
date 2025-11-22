# Frontend - Rocket Control System

Modern React-based web interface for real-time rocket propulsion system monitoring and control.

## Technology Stack

- **Framework**: React 19.1
- **Build Tool**: Vite 6.3
- **Charts**: Chart.js 4.5 + React-Chartjs-2
- **Icons**: Lucide React
- **Real-time**: WebSocket with MessagePack
- **State Management**: React Context API + Hooks

## Features

- **Real-time Dashboard**: Live sensor monitoring with 500Hz update rate
- **Interactive Diagram**: Visual system representation with valve controls
- **Data Analyzer**: Historical Parquet data visualization
- **Automated Sequences**: Pre-configured scenarios (O2 cleaning, fuel cleaning, burning, etc.)
- **Emergency Controls**: Multi-stage emergency shutdown
- **Keyboard Shortcuts**: Quick access to common operations

## Project Structure

```
frontend/
├── src/
│   ├── App.jsx             # Main application component
│   ├── App.css             # Main styles
│   ├── StatusPanel.jsx     # Sensor status visualization
│   ├── StatusPanel.css     # Status panel styles
│   ├── ParquetAnalyzer.jsx # Historical data analyzer
│   ├── ParquetAnalyzer.css # Analyzer styles
│   ├── SVGDiagram.jsx      # System diagram component
│   ├── SVGDiagram.css      # Diagram styles
│   ├── main.jsx            # Application entry point
│   ├── index.css           # Global styles
│   └── toast.js            # Notification utility
├── public/
│   ├── besleme-sistemi.png # System diagram image
│   └── alarm.mp3           # Emergency alarm sound
├── package.json
├── vite.config.js
└── eslint.config.js
```

## Installation

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build
```

## Configuration

Create `.env` file in `frontend/` directory:

```bash
VITE_RPI_IP=192.168.1.2  # Raspberry Pi IP address
```

Or edit `src/App.jsx` directly (defaults to `localhost` for development).

## Usage

### Development

```bash
npm run dev
```

Access at `http://localhost:5173`

### Production

```bash
npm run build
```

Built files in `dist/` directory. Backend serves these automatically.

## Features Overview

### Dashboard View
- Real-time sensor monitoring (8 pressure + 8 temperature)
- Valve control panel (9 solenoids)
- Performance metrics (Thrust, ISP, Total Impulse, Exhaust Velocity)
- System status indicators
- Log viewer

### Diagram View
- Interactive system diagram
- Click-to-control valves
- Sensor data overlays
- Step motor controls
- Emergency button

### Data Analyzer
- Parquet file browser
- Time-series charts
- Multi-sensor comparison
- Export capabilities

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-9` | Toggle valve 1-9 |
| `O` | Oxygen Cleaning |
| `Y` | Fuel Cleaning |
| `P` | Pre-Burning |
| `S` | Burning Start |
| `B` | Burning |
| `E` | Emergency Shutdown |
| `X` | Oxygen Feed |
| `F` | Fuel Feed |
| `Esc` | System Reset |

## WebSocket Communication

### MessagePack Protocol
- Binary serialization (60% smaller than JSON)
- Automatic fallback to JSON if MessagePack unavailable
- Efficient real-time data transmission

### Message Types

**Received**:
- `sensor_data` - Sensor readings
- `valve_response` - Valve command acknowledgment
- `valve_state` - Valve state update
- `step_motor_response` - Step motor command response

**Sent**:
- `valve_command` - Control valves
- `step_motor_command` - Control step motors
- `get_sensors` - Request sensor data
- `system_mode` - Change system mode

## Performance Optimizations

- **Throttled Updates**: 500Hz UI update rate (2ms intervals)
- **MessagePack Decoding**: Efficient binary data handling
- **React Hooks**: Optimized re-renders
- **Context API**: Centralized state management
- **Lazy Loading**: Components loaded on demand

## Development

### Code Style
- ESLint configuration included
- React Hooks best practices
- Functional components preferred

### Testing
- Manual testing with browser DevTools
- WebSocket connection testing: `../tests/test_websocket.html`

## Build & Deploy

### Production Build

```bash
npm run build
```

Output: `dist/` directory

### Deployment

1. Build frontend: `npm run build`
2. Copy `dist/` to backend directory
3. Backend serves static files automatically
4. Access at `http://backend-ip:5001`

## Troubleshooting

### WebSocket Connection Failed
- Check backend is running
- Verify IP address in `App.jsx`
- Check firewall settings
- Test with `test_websocket.html`

### Build Errors
- Clear `node_modules/` and reinstall
- Check Node.js version (18+)
- Verify all dependencies installed

### Performance Issues
- Check browser console for errors
- Reduce update frequency if needed
- Disable unnecessary browser extensions
