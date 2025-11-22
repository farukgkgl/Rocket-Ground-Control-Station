import { useState, useEffect, createContext, useContext, useRef, useLayoutEffect } from 'react'
import './App.css'
import { Bolt, Flame, Droplet, Zap, Gauge, Thermometer, Settings, Cpu, AlertTriangle } from 'lucide-react'
import 'chart.js/auto'
import Xarrow, { Xwrapper } from 'react-xarrows'
import StatusPanel from './StatusPanel'
import ParquetAnalyzer from './ParquetAnalyzer'
import { encode, decode } from '@msgpack/msgpack'

// Raspberry Pi IP adresi - environment variable'dan alınır veya localhost kullanılır
export const RPI_IP = import.meta.env.VITE_RPI_IP || 'localhost'
export const API_URL = `http://${RPI_IP}:5001/api`
export const WS_URL = `ws://${RPI_IP}:5001/ws`

export const DataContext = createContext()

function DataProvider({ children }) {
  // Place this at the very top
  const [isEmergencyAnimating, setIsEmergencyAnimating] = useState(false);
  const automationDebounceRef = useRef({});
  const AUTOMATION_DEBOUNCE_MS = 500;
  const [valves, setValves] = useState(Array(9).fill(0))
  const [sensors, setSensors] = useState({ 
    pressures: [], 
    temperature: 0.0,
    voltage: 0.0,
    timestamp: "",
    errors: []
  })
  const [log, setLog] = useState([])
  const [systemMode, setSystemMode] = useState('idle')
  const [activeView, setActiveView] = useState('dashboard')
  const [showParquetAnalyzer, setShowParquetAnalyzer] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [simulationMode, setSimulationMode] = useState(false)
  
  // Step motor kontrolü için state
  const [stepMotorAngles, setStepMotorAngles] = useState({
    motor1: 0,
    motor2: 0
  })
  
  // Bildirim sistemi için state
  const [notifications, setNotifications] = useState([])
  // Only call useNotification here
  const notify = useNotification(notifications, setNotifications);
  
  // Sesli bildirim için audio context
  const audioContextRef = useRef(null)
  
  
  const wsRef = useRef(null)

  // Timeout id'lerini saklamak için bir ref
  const modTimeoutsRef = useRef([])

  const clearModTimeouts = () => {
    modTimeoutsRef.current.forEach(id => clearTimeout(id))
    modTimeoutsRef.current = []
  }

  // Sensör verisi throttling için buffer ve timer ekle
  const sensorBufferRef = useRef([]);
  const [throttledSensors, setThrottledSensors] = useState(sensors);

  // WebSocket'ten gelen sensör verisini buffer'a ekle
  useEffect(() => {
    if (sensors && sensors.timestamp) {
      sensorBufferRef.current.push(sensors);
    }
  }, [sensors]);

  // 2ms'de bir (500Hz) throttling ile UI'yi güncelle
  useEffect(() => {
    const interval = setInterval(() => {
      if (sensorBufferRef.current.length > 0) {
        const latest = sensorBufferRef.current[sensorBufferRef.current.length - 1];
        // --- SENSÖR MAPPING DÜZELTME ---
        let fixedData = { ...latest };
        // Temperatures: 6 elemanlı diziye tamamla
        if (!Array.isArray(fixedData.temperatures) || fixedData.temperatures.length < 6) {
          const tArr = Array.isArray(fixedData.temperatures) ? fixedData.temperatures : [];
          fixedData.temperatures = [...tArr, ...Array(6 - tArr.length).fill(0.0)];
        }
        // Pressures: 8 elemanlı diziye tamamla
        if (!Array.isArray(fixedData.pressures) || fixedData.pressures.length < 8) {
          const pArr = Array.isArray(fixedData.pressures) ? fixedData.pressures : [];
          fixedData.pressures = [...pArr, ...Array(8 - pArr.length).fill(0.0)];
        }
        setThrottledSensors(fixedData);
        sensorBufferRef.current = [];
      }
    }, 2);
    return () => clearInterval(interval);
  }, []);
  const [pressureControlConfig, setPressureControlConfig] = useState({
    isEnabled: false,
    isConfigOpen: false,
    rules: [
      // örnek kural
      {
        id: 1,
        pressureSensor: 0,
        threshold: 40.0,
        valveIndex: 0,
        action: 'open',
        isActive: true
      }
    ]
  });
  // Basınç kontrolü mantığı
  useEffect(() => {
    if (!pressureControlConfig.isEnabled || systemMode === 'emergency') {
      return;
    }

    const pressures = throttledSensors.pressures || [];
    
    pressureControlConfig.rules.forEach(rule => {
      if (!rule.isActive) return;
      
      const pressure = pressures[rule.pressureSensor];
      if (pressure === undefined || pressure === null) return;
      
      const shouldActivate = rule.action === 'open' 
        ? pressure >= rule.threshold 
        : pressure <= rule.threshold;
      
      const currentValveState = valves[rule.valveIndex];
      const targetValveState = rule.action === 'open' ? 1 : 0;
      
      if (shouldActivate && currentValveState !== targetValveState) {
        // Basınç eşiğine ulaşıldı, solenoid durumunu değiştir
        handleValve(rule.valveIndex, targetValveState);
        setLog(l => [`🔧 Otomatik: P${rule.pressureSensor + 1} ${pressure.toFixed(3)} bar → Vana ${rule.valveIndex + 1} ${rule.action === 'open' ? 'açıldı' : 'kapandı'}`, ...l.slice(0, 19)]);
      }
    });
  }, [throttledSensors.pressures, pressureControlConfig, systemMode, valves]);

  // WebSocket bağlantısı
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('WebSocket bağlantısı kuruldu')
          setWsConnected(true)
          setLog(l => ['🔗 WebSocket bağlantısı kuruldu (msgpack optimize)', ...l.slice(0, 19)])
          
          // İlk sensör verilerini iste
          ws.send(JSON.stringify({ type: 'get_sensors' }))
        }

        ws.onmessage = async (event) => {
          try {
            let data;
            if (event.data instanceof ArrayBuffer) {
              // Binary data - msgpack decode
              data = decode(new Uint8Array(event.data));
            } else if (event.data instanceof Blob) {
              // Blob'u ArrayBuffer'a çevir
              const arrayBuffer = await event.data.arrayBuffer();
              data = decode(new Uint8Array(arrayBuffer));
            } else if (typeof event.data === 'string') {
              // Text data - JSON parse (fallback)
              data = JSON.parse(event.data);
            } else {
              console.warn('Bilinmeyen WebSocket veri tipi:', typeof event.data, event.data);
              return;
            }
            
            if (data.type === 'sensor_data') {
              // Temperatures dizisini garanti altına al
              let fixedData = { ...data.data }
              if (!Array.isArray(fixedData.temperatures) || fixedData.temperatures.length < 4) {
                // Eğer eski format (tek sıcaklık) varsa veya eksikse, doldur
                const t = typeof fixedData.temperature === 'number' ? fixedData.temperature : 0.0;
                fixedData.temperatures = [t, t, t, t]
              }
              // Pressures dizisini garanti altına al (10 elemanlı)
              if (!Array.isArray(fixedData.pressures) || fixedData.pressures.length < 10) {
                const pArr = Array.isArray(fixedData.pressures) ? fixedData.pressures : [];
                fixedData.pressures = [...pArr, ...Array(10 - pArr.length).fill(0.0)];
              }
              setSensors(fixedData)
            } else if (data.type === 'valve_response') {
              if (data.success) {
                setLog(l => ['✅ Vana komutu başarılı', ...l.slice(0, 19)])
              } else {
                setLog(l => ['❌ Vana komutu başarısız', ...l.slice(0, 19)])
              }
            // If backend includes the new valve state in the response, update it
            if (Array.isArray(data.valves)) {
              setValves(data.valves);
            }
            } else if (data.type === 'valve_state') {
              // New: update valves state from backend
              if (Array.isArray(data.valves)) {
                setValves(data.valves);
              }
            } else if (data.type === 'step_motor_response') {
              console.log('Step motor response alındı:', data)
              if (data.success) {
                setLog(l => [`✅ Step Motor ${data.motor_id} komutu başarılı: ${data.angle}°`, ...l.slice(0, 19)])
              } else {
                setLog(l => [`❌ Step Motor ${data.motor_id} komutu başarısız`, ...l.slice(0, 19)])
              }
            } else if (data.type === 'error') {
              setLog(l => [`❌ Hata: ${data.data}`, ...l.slice(0, 19)])
            }
          } catch (e) {
            console.error('WebSocket mesaj parse hatası:', e)
          }
        }

        ws.onclose = () => {
          console.log('WebSocket bağlantısı kapandı')
          setWsConnected(false)
          setLog(l => ['🔌 WebSocket bağlantısı kesildi', ...l.slice(0, 19)])
          
          // 3 saniye sonra yeniden bağlan
          setTimeout(connectWebSocket, 3000)
        }

        ws.onerror = (error) => {
          console.error('WebSocket hatası:', error)
          setWsConnected(false)
        }

      } catch (error) {
        console.error('WebSocket bağlantı hatası:', error)
        setWsConnected(false)
      }
    }

    connectWebSocket()

    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  // Simülasyon modu kontrolü
  useEffect(() => {
    console.log('WebSocket bağlantı durumu:', wsConnected)
    
    // WebSocket bağlı ama STM32 bağlı değilse simülasyon modu
    if (wsConnected) {
      console.log('WebSocket bağlı, sistem durumu kontrol ediliyor...')
      // Sistem durumunu kontrol et
      fetch(`${API_URL}/status`)
        .then(res => res.json())
        .then(data => {
          console.log('Sistem durumu:', data)
          console.log('Simülasyon aktif mi:', data.simulation_active)
          setSimulationMode(data.simulation_active || false)
        })
        .catch(e => {
          console.error("Sistem durumu kontrol hatası:", e)
          setSimulationMode(true) // Hata durumunda simülasyon modu varsay
        })
    } else {
      console.log('WebSocket bağlı değil, simülasyon modu false')
      setSimulationMode(false)
    }
  }, [wsConnected])

  const solenoidDebounceRef = useRef(Array(9).fill(0));

  // --- Emergency overlay exit animation states ---
  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);
  const [emergencyOverlayExiting, setEmergencyOverlayExiting] = useState(false);
  useEffect(() => {
    // Only show emergency overlay when systemMode is actually 'emergency'
    // isEmergencyAnimating is used for valve animations, not for emergency overlay
    if (systemMode === 'emergency') {
      setShowEmergencyOverlay(true);
      setEmergencyOverlayExiting(false);
    } else if (showEmergencyOverlay) {
      // Emergency just ended, trigger exit animation
      setEmergencyOverlayExiting(true);
      const timeout = setTimeout(() => {
        setShowEmergencyOverlay(false);
        setEmergencyOverlayExiting(false);
      }, 600); // 600ms = match CSS transition
      return () => clearTimeout(timeout);
    }
  }, [systemMode]);

  // --- Emergency enforcement ---
  const isEmergencyActive = () => showEmergencyOverlay;
  const enforceEmergency = () => {
    setSystemMode('emergency');
    setShowEmergencyOverlay(true);
    // Optionally, re-trigger animation if needed
    // setIsEmergencyAnimating(true);
  };

  // Helper to set valves and send to STM if changed
  const setAndSendValves = (newValves) => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setValves(current => {
      const isSame = current.length === newValves.length && current.every((v, idx) => v === newValves[idx]);
      if (!isSame) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'valve_command', valves: newValves }));
        }
        return newValves;
      }
      return current;
    });
  };

  // Update handleValve to use setAndSendValves (always send)
  const handleValve = (i, v) => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    const now = Date.now();
    // 200ms debounce
    if (now - solenoidDebounceRef.current[i] < 200) {
      setLog(l => [`⚠️ Vana #${i + 1} için çok hızlı komut!`, ...l.slice(0, 19)]);
      return;
    }
    solenoidDebounceRef.current[i] = now;

    const new_valves = [...valves];
    new_valves[i] = v;
    setAndSendValves(new_valves);
  };

  // Sistem modları


  const resetSystem = () => {
    clearModTimeouts()
    setSystemMode('idle')
    setLog(l => ['🔄 Sistem Sıfırlandı', ...l.slice(0, 19)])
    
    const newValves = Array(9).fill(0)
    setValves(newValves)

    // STM32'ye tüm vanaları kapat komutu gönder
    fetch(`${API_URL}/valves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valves: newValves })
    })
      .then(res => res.json())
      .then(() => {
        setLog(l => ['Tüm vanalar kapatıldı (reset)', ...l.slice(0, 19)])
      })
      .catch(e => console.error('Failed to set all valves to 0 on reset', e))

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'system_mode',
        mode: 'idle'
      }))
      wsRef.current.send(JSON.stringify({
        type: 'valve_command',
        valves: newValves
      }))
    }
  }
  


  

  // Klavye kısayolları için event listener
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Eğer aktif element bir input alanı ise klavye kısayollarını devre dışı bırak
      const activeElement = document.activeElement
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.tagName === 'SELECT' ||
        activeElement.contentEditable === 'true'
      )) {
        return
      }
      // Emergency enforcement: block all except Esc
      if (isEmergencyActive() && event.key !== 'Escape') {
        enforceEmergency();
        return;
      }
      // 1-9 tuşları için vana kontrolü
      const key = event.key;
      if (key >= '1' && key <= '9') {
        const valveIndex = parseInt(key) - 1; // 1-9 -> 0-8 index
        if (valveIndex >= 0 && valveIndex < 9) {
          // Mevcut vana durumunu tersine çevir
          const currentValve = valves[valveIndex];
          handleValve(valveIndex, currentValve ? 0 : 1);
          // Kullanıcıya feedback ver
          setLog(l => [`⌨️ Vana ${key} ${currentValve ? 'kapatıldı' : 'açıldı'} (klavye)`, ...l.slice(0, 19)]);
        }
      }
      // --- SCENARIO SHORTCUTS ---
      if (key === 'o' || key === 'O') {
        oxygenCleaning();
      }
      if (key === 'y' || key === 'Y') {
        fuelCleaning();
      }
      if (key === 'p' || key === 'P') {
        preBurning();
      }
      if (key === 's' || key === 'S') {
        burningStart();
      }
      if (key === 'b' || key === 'B') {
        burning();
      }
      if (key === 'e' || key === 'E') {
        startEmergencyShutdown();
      }
      if (key === 'x' || key === 'X') {
        oxygenFeed();
      }
      if (key === 'f' || key === 'F') {
        fuelFeed();
      }
    };

    // Event listener'ı ekle
    document.addEventListener('keydown', handleKeyPress);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [valves, handleValve, setLog, isEmergencyActive, enforceEmergency]);

  // Replace the Esc key useEffect with this:
  useEffect(() => {
    const handleEscReset = (event) => {
      if (event.key === 'Escape') {
        resetSystem();
      }
    };
    window.addEventListener('keydown', handleEscReset);
    return () => window.removeEventListener('keydown', handleEscReset);
  }, [resetSystem]);

  // --- Automation Functions ---
  // Helper for scenario: update UI and send command
  const runScenario = (scenario, valvePatternOrSteps) => {
    // Removed afterSequence logic that sets systemMode to 'idle'
    if (Array.isArray(valvePatternOrSteps)) {
      let i = 0;
      const next = () => {
        if (i < valvePatternOrSteps.length) {
          const [pattern, delay] = valvePatternOrSteps[i++];
          setAndSendValves(pattern);
          if (delay) setTimeout(next, delay);
        }
      };
      next();
    } else {
      setAndSendValves(valvePatternOrSteps);
    }
  };

  const fuelFeed = () => {
      if (isEmergencyActive()) { enforceEmergency(); return; }
      setSystemMode('fuelfeed');
      runScenario('fuelfeed', [
        [[0,0,0,0,1,0,0,0,0], 3000],
       [[0,0,0,0,1,0,0,1,0], 0]
     ]);
  };

   // Oksijen Besleme: frontend-only valve sequence
  const oxygenFeed = () => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setSystemMode('o2feed');
    runScenario('o2feed', [
      [[0,1,0,0,0,0,0,0,0], 200],
      [[0,1,0,0,0,0,1,0,0], 0]
    ]);
  };
  // Oksijen Temizliği: frontend-only valve sequence
  const oxygenCleaning = () => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setSystemMode('o2cleaning');
    runScenario('o2cleaning', [
      [[0,0,0,0,0,0,1,0,0], 200],
      [[0,0,1,0,0,0,1,0,0], 5000],
      [[0,0,0,0,0,0,1,0,0], 200],
      [[0,0,0,0,0,0,0,0,0], 0]
    ]);
  };
  // Yakıt Temizliği: frontend-only valve sequence
  const fuelCleaning = () => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setSystemMode('fuelcleaning');
    runScenario('fuelcleaning', [
      [[0,0,0,0,0,0,0,1,0], 200],
      [[0,0,0,1,0,0,0,1,0], 5000],
      [[0,0,0,0,0,0,0,1,0], 200],
      [[0,0,0,0,0,0,0,0,0], 0]
    ]);
  };
  // Pre-Burning
  const preBurning = () => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setSystemMode('preburning');
    runScenario('preburning', [
      [[0,1,0,0,1,0,0,0,0], 0]
    ]);
  };
  // Burning Start
  const burningStart = () => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setSystemMode('burningstart');
    runScenario('burningstart', [
      [[0,1,0,0,1,0,0,0,1], 0]
    ]);
  };
  // Burning
  const burning = () => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setSystemMode('burning');
    runScenario('burning', [
      [[0,1,0,0,1,0,1,0,1], 500],
      [[0,1,0,0,1,0,1,1,1], 0]
    ]);
  };

  // Emergency valve sequence (frontend only, no backend communication)
  const runFrontendEmergencyValveSequence = () => {
    setIsEmergencyAnimating(true);
    let valvesState = [...valves];
    const steps = [
      (next) => { valvesState[8] = 0; setValves([...valvesState]); setTimeout(next, 100); },
      (next) => { valvesState[6] = 0; valvesState[7] = 0; setValves([...valvesState]); setTimeout(next, 100); },
      (next) => { valvesState[1] = 0; valvesState[4] = 0; setValves([...valvesState]); setTimeout(next, 100); },
      (next) => { valvesState[0] = 1; valvesState[5] = 1; setValves([...valvesState]); setTimeout(next, 1500); },
      (next) => { valvesState[0] = 0; valvesState[5] = 0; setValves([...valvesState]); setTimeout(next, 200); },
      (next) => { valvesState[6] = 1; valvesState[7] = 1; setValves([...valvesState]); setTimeout(next, 100); },
      (next) => { valvesState[2] = 1; valvesState[3] = 1; setValves([...valvesState]); setTimeout(next, 5000); },
      (next) => { valvesState[2] = 0; valvesState[3] = 0; setValves([...valvesState]); setTimeout(next, 500); },
      (next) => { valvesState[6] = 0; valvesState[7] = 0; setValves([...valvesState]); setTimeout(() => {
        setIsEmergencyAnimating(false);
      }, 100); },
    ];
    let i
 = 0;
    const next = () => { if (i < steps.length) steps[i++](next); };
    next();
  };

  // Emergency valve pattern (STM32 acil durum sekansı ile uyumlu)
  const EMERGENCY_VALVE_PATTERN = [1,0,0,0,0,1,0,0,0]; // RELIEF1 ve RELIEF2 açık, diğerleri kapalı (örnek: ilk adım)

  // Emergency valve scenario steps (STM32 acil durum sekansı ile uyumlu, delays in ms)
  const EMERGENCY_SCENARIO_STEPS = [
    [[0,1,0,0,1,0,1,1,0], 100],    // 010010110
    [[0,1,0,0,1,0,0,0,0], 100],    // 010010000
    [[0,0,0,0,0,0,0,0,0], 100],    // 000000000
    [[1,0,0,0,0,1,0,0,0], 1500],   // 100001000
    [[0,0,0,0,0,0,0,0,0], 200],    // 000000000
    [[0,0,0,0,0,0,1,1,0], 100],    // 000000110
    [[0,0,1,1,0,0,1,1,0], 5000],   // 001100110
    [[0,0,0,0,0,0,1,1,0], 500],    // 000000110
    [[0,0,0,0,0,0,0,0,0], 2000],   // 000000000
  ];

  // Emergency scenario runner (like other scenarios)
  const runEmergencyScenario = () => {
    let i = 0;
    const next = () => {
      if (i < EMERGENCY_SCENARIO_STEPS.length) {
        const [pattern, delay] = EMERGENCY_SCENARIO_STEPS[i++];
        setAndSendValves(pattern);
        if (delay) setTimeout(next, delay);
      } else {
        // Emergency bitti, 2 saniye sonra animasyonu kapat
        setTimeout(() => {
          setSystemMode('idle');
        }, 2000);
      }
    };
    next();
  };

  const startEmergencyShutdown = () => {
    if (isEmergencyActive()) { enforceEmergency(); return; }
    setSystemMode('emergency'); // UI güncelle
    runEmergencyScenario(); // Emergency adımlarını sırayla uygula
  };
  // ... existing code ...
 

  // Place contextValue here, after all function definitions:
  const contextValue = {
    valves,
    setValves,
    sensors,
    setSensors,
    log,
    setLog,
    systemMode,
    setSystemMode,
    activeView,
    setActiveView,
    showParquetAnalyzer,
    setShowParquetAnalyzer,
    wsConnected,
    setWsConnected,
    simulationMode,
    setSimulationMode,
    stepMotorAngles,
    setStepMotorAngles,
    notifications,
    setNotifications,
    notify,
    audioContextRef,
    pressureControlConfig,
    setPressureControlConfig,
    wsRef,
    modTimeoutsRef,
    clearModTimeouts,
    handleValve,
    startEmergencyShutdown,
    resetSystem,
    preBurning,
    oxygenCleaning,
    fuelCleaning,
    burning,
    burningStart,
    isEmergencyAnimating,
    setIsEmergencyAnimating,
    showEmergencyOverlay,
    emergencyOverlayExiting,
    isEmergencyActive,
    enforceEmergency,
    oxygenFeed,
    fuelFeed,
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}

function App() {
  return (
    <DataProvider>
      <AppContent />
    </DataProvider>
  )
}

function AppContent() {
  const { activeView, notifications, showParquetAnalyzer, systemMode, isEmergencyAnimating, showEmergencyOverlay, emergencyOverlayExiting } = useContext(DataContext)
  // Remove old showEmergencyOverlay logic
  // const showEmergencyOverlay = systemMode === 'emergency' || isEmergencyAnimating;
  // ... existing code ...
  return (
    <div className="app-container">
      {/* Emergency overlay message with exit animation */}
      {showEmergencyOverlay && (
        <div
          className={`emergency-overlay${emergencyOverlayExiting ? ' emergency-overlay-exit' : ''}`}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            zIndex: 2000,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            marginTop: 12,
            background: 'rgba(196, 0, 0, 0.93)',
            color: '#fff',
            fontSize: 22,
            fontWeight: 700,
            borderRadius: 10,
            padding: '10px 32px',
            boxShadow: '0 2px 16px 0 rgba(0,0,0,0.13)',
            letterSpacing: 0.5,
            textAlign: 'center',
            pointerEvents: 'none',
            userSelect: 'none',
            transition: 'opacity 0.6s',
            opacity: emergencyOverlayExiting ? 0 : 1,
          }}>
            Sistem Acil Durumda sistemin stabil olmasını bekleyin ve <span style={{color:'#60a5fa'}}>Esc</span> tuşuna basın
          </div>
        </div>
      )}
      {/* ... rest of AppContent ... */}
      <NotificationBox notifications={notifications} />
      {showParquetAnalyzer ? (
        <ParquetAnalyzer isDisabled={systemMode === 'emergency' || isEmergencyAnimating} />
      ) : (
        activeView === 'dashboard' ? <DashboardView isDisabled={systemMode === 'emergency' || isEmergencyAnimating} /> : <DiagramView isDisabled={systemMode === 'emergency' || isEmergencyAnimating} />
      )}
    </div>
  )
}

function DashboardView({ isDisabled }) {
  const { 
    valves, 
    setValves,      
    setLog,         
    sensors, 
    systemMode, 
    startEmergencyShutdown, 
    resetSystem,
    setActiveView,
    wsConnected,
    simulationMode,
    stepMotorAngles,
    setStepMotorAngles,
    notifications,
    setNotifications,
    wsRef,
    showParquetAnalyzer,
    setShowParquetAnalyzer,
    pressureControlConfig,
    setPressureControlConfig,
    preBurning,
    oxygenCleaning,
    fuelCleaning,
    burning,
    burningStart,
    oxygenFeed,
    fuelFeed,
  } = useContext(DataContext)
  
  // Açık vana sayısını hesapla
  const openValvesCount = valves.filter(v => v === 1).length
  
  // Ortalama basıncı hesapla
  const pressures = sensors.pressures || []
  const validPressures = pressures.filter(p => p !== null && p !== undefined && !isNaN(p))
  const averagePressure = validPressures.length > 0 
    ? (validPressures.reduce((sum, p) => sum + p, 0) / validPressures.length).toFixed(3)
    : 'N/A'
  
  // Sistem durumunu belirle
  const getSystemStatus = () => {
    const v = valves;
    const vStr = JSON.stringify(v);

    if (systemMode === 'emergency') {
      return { text: 'Acil Durum', color: 'red', icon: AlertTriangle };
    }
    if (systemMode === 'burning') {
      return { text: 'Burning', color: 'red', icon: Flame };
    }
    if (systemMode === 'burningstart') {
      return { text: 'Burning Start', color: 'orange', icon: Flame };
    }
    if (systemMode === 'preburning') {
      return { text: 'Pre-Burning', color: 'orange', icon: Flame };
    }
    if (systemMode === 'o2cleaning') {
      return { text: 'Oksijen Temizliği Aktif', color: 'blue', icon: Droplet };
    }
    if (systemMode === 'o2feed') {
      return { text: 'O2 Besleme Aktif', color: 'blue', icon: Droplet };
    }
    if (systemMode === 'fuelcleaning') {
      return { text: 'Yakıt Temizliği Aktif', color: 'blue', icon: Droplet };
    }
    if (systemMode === 'fuelfeed') {
      return { text: 'Yakıt Besleme Aktif', color: 'yellow', icon: Droplet };
    }
    // Sadece özel modda değilse beklemede veya kısmi çalışma göster
    else if (vStr === JSON.stringify([0,0,0,0,0,0,0,0,0])) {
      return { text: 'Beklemede', color: 'yellow', icon: Bolt };
    }
    return { text: 'Kısmi Çalışma', color: 'blue', icon: Zap };
  };
  
  const systemStatus = getSystemStatus()
  const StatusIcon = systemStatus.icon

  // Sensör verilerini hazırla - yeni layout için güncellendi
  const sensorData = [
    // Üst 4 büyük panel - P1-T1 ve P2-T2
    { 
      name: 'P1', 
      pt: (pressures[0] !== undefined && pressures[0] !== null) ? `${pressures[0].toFixed(3)} bar` : 'N/A', 
      tt: (Array.isArray(sensors.temperatures) && sensors.temperatures[0] !== undefined && sensors.temperatures[0] !== null) ? `${sensors.temperatures[0].toFixed(3)} °C` : 'N/A',
      ttLabel: 'T1',
      isLarge: true 
    },
    { 
      name: 'P2', 
      pt: (pressures[1] !== undefined && pressures[1] !== null) ? `${pressures[1].toFixed(3)} bar` : 'N/A', 
      tt: (Array.isArray(sensors.temperatures) && sensors.temperatures[1] !== undefined && sensors.temperatures[1] !== null) ? `${sensors.temperatures[1].toFixed(3)} °C` : 'N/A',
      ttLabel: 'T2',
      isLarge: true 
    },
    // T3-T4-P1Chamber: Basınç sadece P1Chamber, sıcaklık T3 ve T4
    { 
      name: 'P1Chamber', 
      pt: (pressures[6] !== undefined && pressures[6] !== null) ? `${pressures[6].toFixed(3)} bar` : 'N/A', 
      tt: (Array.isArray(sensors.temperatures) && sensors.temperatures[2] !== undefined && sensors.temperatures[2] !== null && sensors.temperatures[3] !== undefined && sensors.temperatures[3] !== null) ? `${sensors.temperatures[2].toFixed(3)} / ${sensors.temperatures[3].toFixed(3)} °C` : 'N/A',
      ttLabel: 'T3,T4',
      isLarge: true 
    },
    // T5-T6-P2Chamber: Basınç sadece P2Chamber, sıcaklık T5 ve T6
    { 
      name: 'P2Chamber', 
      pt: (pressures[7] !== undefined && pressures[7] !== null) ? `${pressures[7].toFixed(3)} bar` : 'N/A', 
      tt: (Array.isArray(sensors.temperatures) && sensors.temperatures[4] !== undefined && sensors.temperatures[4] !== null && sensors.temperatures[5] !== undefined && sensors.temperatures[5] !== null) ? `${sensors.temperatures[4].toFixed(3)} / ${sensors.temperatures[5].toFixed(3)} °C` : 'N/A',
      ttLabel: 'T5,T6',
      isLarge: true 
    },
        // Tbogaz1-Tbogaz2: Sadece sıcaklık sensörleri
    { 
      name: 'Tbogaz1', 
      pt: '', 
      tt: (Array.isArray(sensors.temperatures) && sensors.temperatures[6] !== undefined && sensors.temperatures[6] !== null) ? `${sensors.temperatures[6].toFixed(3)} °C` : 'N/A',
      ttLabel: 'Tbogaz1',
      isLarge: true 
    },
    { 
      name: 'Tbogaz2', 
      pt: '', 
      tt: (Array.isArray(sensors.temperatures) && sensors.temperatures[7] !== undefined && sensors.temperatures[7] !== null) ? `${sensors.temperatures[7].toFixed(3)} °C` : 'N/A',
      ttLabel: 'Tbogaz2',
      isLarge: true 
    },
    // Alt 4 küçük panel - sadece basınç
    { name: 'P3', pt: (pressures[2] !== undefined && pressures[2] !== null) ? `${pressures[2].toFixed(3)} bar` : 'N/A', tt: '', isLarge: false },
    { name: 'P4', pt: (pressures[3] !== undefined && pressures[3] !== null) ? `${pressures[3].toFixed(3)} bar` : 'N/A', tt: '', isLarge: false },
            { name: 'P5', pt: (pressures[4] !== undefined && pressures[4] !== null) ? `${pressures[4].toFixed(3)} bar` : 'N/A', tt: '', isLarge: false },
        { name: 'P6', pt: (pressures[5] !== undefined && pressures[5] !== null) ? `${pressures[5].toFixed(3)} bar` : 'N/A', tt: '', isLarge: false },
  ]

  const [automationPopupOpen, setAutomationPopupOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Besleme Sistemi Kontrol Paneli</h1>
        <div className="header-controls">
          {console.log('Simülasyon modu render:', simulationMode)}
          {simulationMode && (
            <div className="simulation-status">
              <div className="simulation-dot"></div>
              Simülasyon Modu
            </div>
          )}
          <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
            <div className="status-dot"></div>
            {wsConnected ? 'Bağlı' : 'Bağlantı Yok'}
          </div>
          <button 
            onClick={() => setActiveView('diagram')}
            className="view-toggle-btn"
          >
            Şema Görünümü
          </button>
          <button 
            onClick={() => setShowParquetAnalyzer(true)}
            className="view-toggle-btn"
            style={{ backgroundColor: '#059669', marginLeft: '8px' }}
          >
            📊 Veri Analizi
          </button>
        </div>
      </div>

      {/* Durum Kartları */}
      <div className="status-cards">
        <div className="status-card">
          <div className="status-card-label">Açık solenoid sayısı</div>
          <div className="status-card-value vanes vanes-large">{openValvesCount} / 9</div>
        </div>
        <div className={`status-card${systemStatus.color === 'yellow' ? ' status-yellow' : systemStatus.color === 'blue' ? ' status-blue' : systemStatus.color === 'red' ? ' status-red' : ''}`}
          style={{ minWidth: 210 }} // Ensures consistent width
        >
          <div className="status-card-label">Sistem Durumu</div>
          <div className={`status-card-value status ${systemStatus.color}`} style={{ minWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <StatusIcon className="w-5 h-5" /> 
            {systemStatus.text}
          </div>
        </div>
        {/* Solenoid 1-9 panelleri */}
        <div style={{ display: 'flex', gap: '1.2rem', marginLeft: '0.2rem' }}>
          {valves.map((v, idx) => {
            const solenoidNames = ['RELIEF1', 'GOX1', 'PURGE1', 'PURGE2', 'FUEL1', 'RELIEF2', 'GOX2', 'FUEL2', 'IGNITION'];
            return (
              <div key={idx} style={{
                background: '#18181b',
                border: '2px solid #222',
                borderRadius: 8,
                minWidth: 100,
                maxWidth: 120,
                minHeight: 54,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                padding: '0.3rem 0.2rem',
                fontFamily: 'Roboto Mono, Consolas, Menlo, monospace',
                fontWeight: 700,
                fontSize: 13,
                color: '#fff',
                position: 'relative',
                borderColor: v ? '#22c55e' : '#ef4444',
                transition: 'border-color 0.2s',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{solenoidNames[idx]}</div>
                <div style={{
                  width: 20,
                  height: 22,
                  borderRadius: '50%',
                  background: v ? 'linear-gradient(135deg, #22c55e 60%, #16a34a 100%)' : 'linear-gradient(135deg, #ef4444 60%, #dc2626 100%)',
                  border: v ? '2px solid #16a34a' : '2px solid #b91c1c',
                  marginTop: 2,
                  boxShadow: v ? '0 0 8px 2px #22c55e55' : '0 0 8px 2px #ef444455',
                  transition: 'background 0.2s, border 0.2s',
                }} />
                <div style={{ fontSize: 10, color: v ? '#22c55e' : '#ef4444', fontWeight: 700, marginTop: 2 }}>{v ? 'Açık' : 'Kapalı'}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Birleşik Sensör ve Performans Paneli */}
      <div className="unified-sensor-panel">
        <div className="unified-sensor-grid">
          {/* Sensör Kutuları */}
          {sensorData.map((sensor, i) => {
            // Sıcaklık ve basınç değerlerine göre renk belirle
            let tempColor = '';
            let pressureColor = '';
            // Sıcaklık için
            if (sensor.tt && sensor.isLarge) {
              const tempVal = parseFloat(sensor.tt);
              if (!isNaN(tempVal)) {
                if (tempVal < 10) tempColor = 'sensor-value-blue';
                else if (tempVal < 40) tempColor = 'sensor-value-white';
                else tempColor = 'sensor-value-red';
              }
            }
            // Basınç için
            if (sensor.pt) {
              const ptVal = parseFloat(sensor.pt);
              if (!isNaN(ptVal)) {
                if (ptVal < 40) pressureColor = 'sensor-value-white';
                else pressureColor = 'sensor-value-red';
              }
            }
            return (
              <div key={i} className={`sensor-card ${sensor.isLarge ? 'sensor-card-large' : 'sensor-card-small'}`}>
                {/* Tbogaz1 ve Tbogaz2 için sadece sıcaklık göster */}
                {(sensor.name === 'Tbogaz1' || sensor.name === 'Tbogaz2') ? (
                  <>
                    <div className="performance-label">
                      <Thermometer className="w-3 h-3 sensor-label-red" />
                      {sensor.name}
                    </div>
                    <div className={`sensor-value temperature ${tempColor}`}>{sensor.tt}</div>
                  </>
                ) : (
                  <>
                    <div className="performance-label">
                      <Gauge className="w-3 h-3 sensor-label-blue" />
                      {sensor.name}
                    </div>
                    <div className={`sensor-value ${pressureColor}`}>{sensor.pt}</div>
                    {sensor.tt && sensor.isLarge && (
                      <>
                        <div className="performance-label">
                          <Thermometer className="w-3 h-3 sensor-label-red" />
                          {sensor.ttLabel || 'T'}
                        </div>
                        <div className={`sensor-value temperature ${tempColor}`}>{sensor.tt}</div>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
          
          {/* Performans Kartları */}
          <div className="performance-card">
            <div className="performance-label">
              <Zap className="w-3 h-3 sensor-label-blue" />
              ISP
            </div>
            <div className="performance-value">
              {Number.isFinite(sensors.isp) ? `${sensors.isp.toFixed(3)} s` : 'N/A'}
            </div>
          </div>
          
          <div className="performance-card">
            <div className="performance-label">
              <Flame className="w-3 h-3 sensor-label-red" />
              Thrust
            </div>
            <div className="performance-value">
              {Number.isFinite(sensors.thrust) ? `${sensors.thrust.toFixed(3)} N` : 'N/A'}
            </div>
          </div>
          

          
          <div className="performance-card">
            <div className="performance-label">
              <Droplet className="w-3 h-3 sensor-label-blue" />
              O2 Debisi
            </div>
            <div className="performance-value">
              {Number.isFinite(sensors.oxygen_consumption) ? `${sensors.oxygen_consumption.toFixed(2)} Kg/s` : 'N/A'}
            </div>
          </div>
          
          <div className="performance-card">
            <div className="performance-label">
              <Droplet className="w-3 h-3 sensor-label-yellow" />
              Yakıt Debisi
            </div>
            <div className="performance-value">
              {Number.isFinite(sensors.fuel_consumption) ? `${sensors.fuel_consumption.toFixed(2)} Kg/s` : 'N/A'}
            </div>
          </div>
          
          <div className="performance-card">
            <div className="performance-label">
              <Bolt className="w-3 h-3 sensor-label-green" />
              Total Impulse
            </div>
            <div className="performance-value">
              {Number.isFinite(sensors.total_impulse) ? `${sensors.total_impulse.toFixed(0)} Ns` : 'N/A'}
            </div>
          </div>
          
          <div className="performance-card">
            <div className="performance-label">
              <Zap className="w-3 h-3 sensor-label-blue" />
              Egzoz Hızı
            </div>
            <div className="performance-value">
              {Number.isFinite(sensors.exhaust_velocity) ? `${sensors.exhaust_velocity.toFixed(0)} m/s` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Sistem Kontrol Butonları */}
      <div className="control-section" style={{ background: '#18181b', border: 'none' }}>
        <div className="control-title">Sistem Kontrolü</div>
        <div className="control-buttons">
          <button 
            onClick={() => setTestModalOpen(true)}
            className="control-btn test-blue"
          >
            <Settings className="w-4 h-4" /> 
            Oksijen ve Yakıt Kontrolleri
          </button>
          <button 
            onClick={() => setAutomationPopupOpen(true)}
            className="control-btn automation"
          >
            <Cpu className="w-4 h-4" style={{marginRight: 6}} />
            Otomasyon Modu
          </button>
          <button 
            onClick={startEmergencyShutdown}
            className="control-btn emergency"
          >
            <AlertTriangle className="w-4 h-4" /> 
            Acil Durum
          </button>
          <button 
            onClick={resetSystem}
            className="control-btn reset"
          >
            <Zap className="w-4 h-4" /> 
            Sistem Sıfırla
          </button>
        </div>
      </div>

      {/* Log Bölümü */}
      <LogSection />
      {/* Otomasyon Modal Pop-up */}
      {automationPopupOpen && (
        <OtomasyonModal open={automationPopupOpen} onClose={() => setAutomationPopupOpen(false)} />
      )}
      {/* o2 ve yakıt Kontrolleri Modal */}
      {testModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.45)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: 380,
            minWidth: 280,
            minHeight: 220,
            background: '#18181b',
            borderRadius: 16,
            boxShadow: '0 4px 32px #000a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            fontFamily: 'inherit',
            color: '#fff',
            padding: 32,
          }}>
            <button onClick={() => setTestModalOpen(false)} style={{
              position: 'absolute',
              top: 16,
              right: 22,
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: 26,
              cursor: 'pointer',
              fontWeight: 700,
              zIndex: 2
            }}>×</button>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, textAlign: 'center', width: '100%' }}>Oksijen ve Yakıt Kontrolleri</div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              gap: 18,
              width: '100%',
              marginTop: 10,
              marginBottom: 10
            }}>
              <button
                onClick={oxygenCleaning}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: '2.5px solid #2563eb',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 700,
                  padding: '18px 0',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                Oksijen Temizliği (O)
              </button>
              <button
                onClick={fuelCleaning}
                style={{
                  background: '#059669',
                  color: '#fff',
                  border: '2.5px solid #059669',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 700,
                  padding: '18px 0',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                Yakıt Temizliği (Y)
              </button>
              <button
                onClick={oxygenFeed}
                style={{
                  background: '#60a5fa',
                  color: '#18181b',
                  border: '2.5px solid #60a5fa',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 700,
                  padding: '18px 0',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                O2 Besleme (X)
              </button>
              <button
                onClick={fuelFeed}
                style={{
                  background: '#fbbf24',
                  color: '#18181b',
                  border: '2.5px solid #fbbf24',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 700,
                  padding: '18px 0',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                Yakıt Besleme (F)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DiagramView({ isDisabled }) {
  const { setActiveView, valves, handleValve, systemMode, sensors, stepMotorAngles, setStepMotorAngles, resetSystem, setLog, setNotifications, wsRef, startEmergencyShutdown } = useContext(DataContext)
  const [hoveredSensorBox, setHoveredSensorBox] = useState(null);
  const [hoveredAnchorDot, setHoveredAnchorDot] = useState(null);
  const [selectedSensorBoxes, setSelectedSensorBoxes] = useState([]);
  const [panelHeights, setPanelHeights] = useState([]);
  const [stepMotorInputs, setStepMotorInputs] = useState({ motor1: '', motor2: '' });

  // 8 anchor noktası koordinatları (örnek, sen güncelleyebilirsin)
  const anchorDots = [
    { top: '58.8%', left: '33.1%' },
    { top: '58.8%', left: '51.3%' },
    { top: '92.2%', left: '37.3%' },
    { top: '92.2%', left: '42.3%' },
    { top: '64.3%', left: '33.1%' },
    { top: '63.7%', left: '51.3%' },
    { top: '87.7%', left: '33.1%' },
    { top: '87.7%', left: '51.2%' },
  ];

  // Kullanıcıdan alınan güncel eşleşme:
      // P1,T1 --> 1.anchor (0)
    // P2,T2 --> 2.anchor (1)
    // P1Chamber,T3,T4 --> 3.anchor (2)
    // P2Chamber,T5,T6 --> 4.anchor (3)
        // P3,P4,P5,P6 --> 5.,6.,7.,8. anchorlar (4,5,6,7)
  const sensorBoxToAnchorDot = [
    0, // T1
    1, // T2
    2, // T3
    2, // T4
    3, // T5
    3, // T6
    0, // P1
    1, // P2
    4, // P3
    5, // P4
                  6, // P5
    7, // P6
     2, // P1Chamber
     3, // P2Chamber
    // D1: Oksijen tüketimi, D2: Yakıt tüketimi
    null,
    null
  ];
  const anchorDotToSensorBoxes = [
    [0, 6],      // Anchor 0: T1, P1
    [1, 7],      // Anchor 1: T2, P2
    [2, 3, 12],  // Anchor 2: T3, T4, P1Chamber
    [4, 5, 13],  // Anchor 3: T5, T6, P2Chamber
    [8],         // Anchor 4: P3
    [9],         // Anchor 5: P4
          [10],        // Anchor 6: P5
      [11],        // Anchor 7: P6
  ];

  // Sensör kutucuğu tıklanınca paneli aç (maksimum 2 panel)
  const handleSensorBoxClick = (i) => {
    setSelectedSensorBoxes(prev => {
      if (prev.includes(i)) {
        // Kapat: zaten açıksa kaldır
        return prev.filter(j => j !== i);
      } else if (prev.length < 2) {
        // Aç: 2'den azsa ve zaten yoksa ekle
        return [...prev, i];
      } else {
        // 2 açıkken üçüncüyü açmaya çalışırsa: 
        // İlk paneli kapat, 2. paneli sağ üste taşı, 3. paneli altına koy
        const secondPanel = prev[1]; // 2. paneli al
        return [secondPanel, i]; // 2. paneli sağ üste, yeni paneli altına koy
      }
    });
  };

  // Bir anchor dot ile eşleşen kutucukları bul
  function isBoxHovered(i) {
    return (
      hoveredSensorBox === i ||
      (hoveredAnchorDot !== null && anchorDotToSensorBoxes[hoveredAnchorDot]?.includes(i))
    );
  }

  // Her panelin yüksekliğini ölçmek için ref dizisi
  const panelRefs = useRef([]);
  useLayoutEffect(() => {
    // Panel yüksekliklerini güncelle
    setPanelHeights(
      selectedSensorBoxes.map((_, i) =>
        panelRefs.current[i]?.offsetHeight || 320
      )
    );
  }, [selectedSensorBoxes]);

  console.log('Aktif kutular:', selectedSensorBoxes);

  return (
    <div className="diagram-container-wrapper">
      {/* Emergency Red Button */}
      <button
        onClick={startEmergencyShutdown}
        style={{
          position: 'fixed',
          top: 740,
          right: 1370,
          zIndex: 3000,
          background: '#dc2626',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 22,
          fontWeight: 900,
          padding: '18px 36px',
          boxShadow: '0 4px 24px #dc262688',
          cursor: 'pointer',
          letterSpacing: 1.5,
          transition: 'background 0.2s',
        }}
      >
        🚨 EMERGENCY
      </button>
      {/* Emergency overlay - only show during actual emergency */}
      {systemMode === 'emergency' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            marginTop: 12,
            background: 'rgba(196, 0, 0, 0.93)',
            color: '#fff',
            fontSize: 22,
            fontWeight: 700,
            borderRadius: 10,
            padding: '10px 32px',
            boxShadow: '0 2px 16px 0 rgba(0,0,0,0.13)',
            opacity: 1,
            letterSpacing: 0.5,
            textAlign: 'center',
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            Sistem Acil Durumda sistemin stabil olmasını bekleyin
          </div>
        </div>
      )}
      {/* Durum Paneli */}
      {selectedSensorBoxes.length > 0 && (
        (() => {
          let cumulativeTop = 32;
          const gap = 16; // paneller arası boşluk
          const panels = [];
          for (let i = 0; i < selectedSensorBoxes.length; i++) {
            const idx = selectedSensorBoxes[i];
            const height = panelHeights[i] || 320; // Ölçülmüş yükseklik veya varsayılan
            panels.push(
              <StatusPanel
                key={`${idx}-${i}`}
                ref={el => (panelRefs.current[i] = el)}
                style={{
                  position: 'fixed',
                  top: `${cumulativeTop}px`,
                  right: 32,
                  width: 270,
                  zIndex: 2000 + i,
                  pointerEvents: 'auto'
                }}
                sensorIndex={idx}
                onClose={() => setSelectedSensorBoxes(selectedSensorBoxes.filter(j => j !== idx))}
                sensors={sensors}
              />
            );
            cumulativeTop += height + gap;
          }
          return panels;
        })()
      )}
      <div className="diagram-header">
        <button 
          onClick={() => setActiveView('dashboard')}
          className="view-toggle-btn"
        >
          Dashboard
        </button>
        {/* Vana Paneli (Şema görünümü için) */}
        <div className="valve-panel-section diagram-valve-panel">
          <div className="valve-panel-title">SOLENOID PANELI</div>
          <div className="valve-panel-grid diagram-valve-panel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: '0.2 rem' }}>
            {[...Array(9)].map((_, i) => {
              const solenoidNames = ['RELIEF1', 'GOX1', 'PURGE1', 'PURGE2', 'FUEL1', 'RELIEF2', 'GOX2', 'FUEL2', 'IGNITION'];
              return (
                <button
                  key={i}
                  className={`valve-panel-btn ${valves[i] ? 'open' : 'closed'}`}
                  onClick={() => handleValve(i, valves[i] ? 0 : 1)}
                  disabled={isDisabled}
                  style={{ flex: 1, margin: '0 2px' }}
                >
                  <div className="valve-panel-number" style={{ fontSize: '11.5px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Roboto Mono, Consolas, monospace', letterSpacing: '0.5px' }}>{solenoidNames[i]}</div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Sensör Paneli (2 sütun, 10 satır = 20 kutu) */}
        <div className="valve-panel-section diagram-sensor-panel">
          <div className="valve-panel-title">SENSOR PANELI</div>
          <div className="sensor-panel-grid">
            {[...Array(20)].map((_, i) => {
              let label = '';
              let value = '';
              let sensorIndex = i; // Varsayılan olarak i kullan
              if (i < 6) {
                label = `T${i + 1}`;
                value = Array.isArray(sensors.temperatures) && sensors.temperatures[i] !== undefined
                  ? `${sensors.temperatures[i]?.toFixed(3)} °C`
                  : 'N/A';
              } else if (i < 14) {
                if (i === 12) {
                  label = 'P1Chamber';
                } else if (i === 13) {
                  label = 'P2Chamber';
                } else {
                  label = `P${i - 5}`;
                }
                value = Array.isArray(sensors.pressures) && sensors.pressures[i - 6] !== undefined
                  ? `${sensors.pressures[i - 6]?.toFixed(3)} bar`
                  : 'N/A';
                              } else if (i === 14) {
                  label = 'Tbogaz1';
                  value = Array.isArray(sensors.temperatures) && sensors.temperatures[6] !== undefined
                    ? `${sensors.temperatures[6]?.toFixed(3)} °C`
                    : 'N/A';
                } else if (i === 15) {
                  label = 'Tbogaz2';
                  value = Array.isArray(sensors.temperatures) && sensors.temperatures[7] !== undefined
                    ? `${sensors.temperatures[7]?.toFixed(3)} °C`
                    : 'N/A';
                } else if (i === 16) {
                  label = 'O2_Debisi';  // D1 verisi
                  value = sensors.oxygen_consumption !== undefined ? `${sensors.oxygen_consumption?.toFixed(2)} Kg/s` : 'N/A';
                  sensorIndex = 16; // O2 tüketim için doğru indeks
                } else if (i === 17) {
                  label = 'Yakit_Debisi';  // D2 verisi
                  value = sensors.fuel_consumption !== undefined ? `${sensors.fuel_consumption?.toFixed(2)} Kg/s` : 'N/A';
                  sensorIndex = 17; // Yakıt tüketim için doğru indeks
                } else if (i === 18) {
                  label = 'ISP';
                  value = sensors.isp !== undefined ? `${sensors.isp?.toFixed(3)} s` : 'N/A';
                  sensorIndex = 18; // ISP için doğru indeks
                } else if (i === 19) {
                  label = 'Thrust';
                  value = sensors.thrust !== undefined ? `${sensors.thrust?.toFixed(3)} N` : 'N/A';
                  sensorIndex = 19; // Thrust için doğru indeks
                } else if (i === 20) {
                  label = 'Egzoz_Hizi';
                  value = sensors.exhaust_velocity !== undefined ? `${sensors.exhaust_velocity?.toFixed(0)} m/s` : 'N/A';
                  sensorIndex = 20; // Egzoz hızı için doğru indeks
                } else if (i === 21) {
                  label = 'Total_Impulse';
                  value = sensors.total_impulse !== undefined ? `${sensors.total_impulse?.toFixed(0)} Ns` : 'N/A';
                  sensorIndex = 21; // Total Impulse için doğru indeks
                }
              return (
                  <div
                  className={`sensor-panel-cell${isBoxHovered(i) ? ' sensor-panel-cell-hover' : ''}${selectedSensorBoxes.includes(i) ? ' sensor-panel-cell-active' : ''}`}
                  key={label}
                    onMouseEnter={() => setHoveredSensorBox(i)}
                    onMouseLeave={() => setHoveredSensorBox(null)}
                    onClick={() => handleSensorBoxClick(i)}
                  style={{ cursor: 'pointer' }}
                  >
                  <div className="sensor-panel-label">{label}</div>
                  <div className="sensor-panel-box">{value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* 8 anchor dot'u şemada göster */}
      <div className="diagram-dot-layer">
        {anchorDots.map((dot, idx) => {
          const isDotHovered =
            (hoveredSensorBox !== null && sensorBoxToAnchorDot[hoveredSensorBox] === idx) ||
            hoveredAnchorDot === idx;
          return (
            <div
              key={idx}
              className={`diagram-anchor-dot${isDotHovered ? ' diagram-anchor-dot-hover' : ''}`}
              style={{ position: 'absolute', top: dot.top, left: dot.left }}
              onMouseEnter={() => setHoveredAnchorDot(idx)}
              onMouseLeave={() => setHoveredAnchorDot(null)}
            />
          );
        })}
      </div>
      {/* Bilgi Paneli - Sağda, dikey ortalanmış */}
      <div
        className="valve-panel-section info-panel"
        style={{
          position: 'fixed',
          right: 5,
          top: '79%',
          transform: 'translateY(-50%)',
          width: 280,
          minWidth: 100,
          padding: '6px 4px 6px 4px',
          height: '260px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#23272a',
          border: '2px solid #444950',
          borderRadius: 10,
          boxShadow: 'none',
          zIndex: 2001,
          pointerEvents: 'auto',
        }}
      >
        {/* Step Motor Inputs */}
        <div style={{ width: '100%', display: 'flex', gap: 8, marginBottom: 30, marginTop: 5 }}>
          {[1,2].map((motorIndex) => (
            <div key={motorIndex} style={{ flex: 1 }}>
              <div style={{ color: '#bbb', fontSize: 12, marginBottom: 2, textAlign: 'center' }}>Step Motor {motorIndex}</div>
              <input
                type="number"
                value={stepMotorInputs[`motor${motorIndex}`]}
                onChange={e => {
                  const val = e.target.value;
                  setStepMotorInputs(prev => ({ ...prev, [`motor${motorIndex}`]: val }));
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed)) {
                    setStepMotorAngles(prev => ({ ...prev, [`motor${motorIndex}`]: parsed }));
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = stepMotorInputs[`motor${motorIndex}`];
                    const parsed = parseFloat(val);
                    if (!isNaN(parsed) && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({
                        type: 'step_motor_command',
                        motor_id: motorIndex,
                        angle: parsed
                      }));
                      setLog(l => [`Step Motor ${motorIndex} komutu gönderildi: ${parsed}°`, ...l.slice(0, 19)]);
                      // Bildirim kutucuğu göster
                      const notifId = Date.now() + Math.random();
                      setNotifications(prev => [{ id: notifId, text: `${parsed}° döndürülüyor.`, entering: true }, ...prev.slice(0, 4)]);
                      setTimeout(() => {
                        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, entering: false } : n));
                      }, 400);
                      setTimeout(() => {
                        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, exiting: true } : n));
                        setTimeout(() => {
                          setNotifications(prev => prev.filter(n => n.id !== notifId));
                        }, 300);
                      }, 3000);
                      // KUTUCUĞU TEMİZLE
                      setStepMotorInputs(prev => ({ ...prev, [`motor${motorIndex}`]: '' }));
                    }
                  }
                }}
                className="step-motor-input"
                placeholder="Açınızı giriniz"
                step="1"
                style={{ width: '91%', padding: '6px', borderRadius: 5, border: '1px solid #444950', background: '#181a1d', color: '#fff', fontSize: 15, textAlign: 'center', minHeight: 10 }}
              />
            </div>
          ))}
        </div>
        {/* 4 Sensör Kutucuğu (gerçek değerlerle) */}
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: -20 }}>
          {[0,1,2,3].map((i) => {
            let label = '';
            let value = '';
            let unit = '';
            let sensorIndex = 0;
            if (i === 0) {
              label = 'Egzoz Hızı';
              value = Number.isFinite(sensors.exhaust_velocity) ? `${sensors.exhaust_velocity?.toFixed(0)}` : 'N/A';
              unit = 'm/s';
              sensorIndex = 22; // Egzoz hızı için sensör indeksi
            } else if (i === 1) {
              label = 'Total Impulse';
              value = Number.isFinite(sensors.total_impulse) ? `${sensors.total_impulse?.toFixed(0)}` : 'N/A';
              unit = 'Ns';
              sensorIndex = 23; // Total impulse için sensör indeksi
            } else if (i === 2) {
              label = 'ISP';
              value = Number.isFinite(sensors.isp) ? `${sensors.isp?.toFixed(1)}` : 'N/A';
              unit = 's';
              sensorIndex = 20; // ISP için sensör indeksi
            } else if (i === 3) {
              label = 'Thrust';
              value = Number.isFinite(sensors.thrust) ? `${sensors.thrust?.toFixed(1)}` : 'N/A';
              unit = 'N';
              sensorIndex = 21; // Thrust için sensör indeksi
            }
                          return (
                <div 
                  key={i} 
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 2, cursor: 'pointer' }}
                  className={`sensor-panel-cell${selectedSensorBoxes.includes(sensorIndex) ? ' sensor-panel-cell-active' : ''}`}
                  onClick={() => handleSensorBoxClick(sensorIndex)}
                >
                <div style={{ fontSize: 13, color: '#b6bfc6', fontWeight: 500, marginBottom: 2 }}>{label}</div>
                <div className="valve-panel-btn" style={{ borderRadius: 0, padding: '10px 0', fontSize: 12, fontWeight: 700, margin: 0, minHeight: 0, lineHeight: 1.2, background: '#181a1d', color: '#fff', border: '1.5px solid #444950', boxShadow: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 0.5 }}>
                  {value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AllCards />
    </div>
  )
}

function AllCards() {
  const { sensors, valves, stepMotorAngles, setStepMotorAngles } = useContext(DataContext)

  const p = sensors.pressures || [];
  const t = sensors.temperatures || [];

  const groupedSensors = {
    combo1: [
      { label: 'P1Chamber', value: p[0], unit: 'bar' },
      { label: 'P2Chamber', value: p[1], unit: 'bar' },
      { label: 'T3', value: sensors.temperature, unit: '°C' }
    ],
    combo2: [
      { label: 'P9', value: p[2], unit: 'bar' },
      { label: 'P10', value: p[3], unit: 'bar' },
      { label: 'T4', value: sensors.temperature, unit: '°C' }
    ],
    pt_tt_1: [
      { label: 'P1', value: p[4], unit: 'bar' },
      { label: 'T1', value: sensors.temperature, unit: '°C' },
    ],
    pt_tt_2: [
      { label: 'P2', value: p[5], unit: 'bar' },
      { label: 'T2', value: sensors.temperature, unit: '°C' },
    ],
    pressure1: [{ label: 'P3', value: p[0], unit: 'bar' }],
    pressure2: [{ label: 'P4', value: p[1], unit: 'bar' }],
    pressure3: [{ label: 'P5', value: p[4], unit: 'bar' }],
    pressure4: [{ label: 'P6', value: p[5], unit: 'bar' }],
  }
  
  const elementPositions = {
    valves: [
      { top: '53.5%', left: '29.1%', label: '1' },   // 390/1518, 425/1600
      { top: '46.6%', left: '32.4%', label: '2' },   // 340/1518, 478/1600
      { top: '45.7%', left: '35.6%', label: '3' },   // 335/1518, 530/1600
      { top: '46%', left: '41%', label: '4' },   // 335/1518, 602/1600
      { top: '39%', left: '48.2%', label: '5' },   // 282/1518, 720/1600
      { top: '44.2%', left: '52.7%', label: '6' },   // 325/1518, 790/1600
      { top: '70.5%', left: '32.4%', label: '7' },   // 515/1518, 476/1600
      { top: '71%', left: '48.2%', label: '8' },   // 517/1518, 720/1600
    ],
    grouped: [
      { id: 'combo1', anchor: { top: 690, left: 575 }, box: { top: 680, left: 20 }, sensors: groupedSensors.combo1, layout: 'row' },
      { id: 'combo2', anchor: { top: 690, left: 646 }, box: { top: 670, left: 1165 }, sensors: groupedSensors.combo2, layout: 'row' },
      { id: 'pt_tt_1', anchor: { top: 440, left: 505 }, box: { top: 375, left: 90 }, sensors: groupedSensors.pt_tt_1 },
      { id: 'pt_tt_2', anchor: { top: 430, left: 790 }, box: { top: 430, left: 1180 }, sensors: groupedSensors.pt_tt_2 },
      { id: 'p1', anchor: { top: 480, left: 505 }, box: { top: 460, left: 90 }, sensors: groupedSensors.pressure1 },
      { id: 'p2', anchor: { top: 475, left: 787 }, box: { top: 485, left: 1180 }, sensors: groupedSensors.pressure2 },
      { id: 'p3', anchor: { top: 655, left: 510 }, box: { top: 615, left: 90 }, sensors: groupedSensors.pressure3 },
      { id: 'p4', anchor: { top: 655, left: 787 }, box: { top: 615, left: 1180 }, sensors: groupedSensors.pressure4 },
    ],
    stepMotors: [
      { id: 'step_motor_1', anchor: { top: 620, left: 485 }, box: { top: 525, left: 50 } },
      { id: 'step_motor_2', anchor: { top: 620, left: 770 }, box: { top: 550, left: 1180 } }
    ]
  };

  return (
    <div className="diagram-container-wrapper">
      <Xwrapper>
        <div className="diagram-container" style={{ backgroundImage: `url(/besleme-sistemi.png)` }}>
          {elementPositions.valves.map((pos, i) => (
            <SolenoidValveDisplay 
              key={`valve-${i}`} 
              index={i} 
              top={pos.top} 
              left={pos.left} 
              label={pos.label}
            />
          ))}
        </div>
      </Xwrapper>
    </div>
  )
}

function SolenoidValveDisplay({ index, top, left, label }) {
  const { valves, handleValve, systemMode } = useContext(DataContext)
  const v = valves[index]
  
  // Acil durum modunda vanaları devre dışı bırak
  const isDisabled = systemMode === 'emergency'

  const onActivate = () => {
    if (!isDisabled) {
      handleValve(index, v ? 0 : 1)
    }
  }

  return (
    <button
      className={`sv-display ${v ? 'on' : 'off'} ${isDisabled ? 'disabled' : ''}`}
      style={{ top: top, left: left }}
      onClick={onActivate}
      title={`Vana #${label}`}
      disabled={isDisabled}
    >
      <span className="valve-number">{label}</span>
    </button>
  )
}

function LogSection() {
  const { log } = useContext(DataContext)

  return (
    <div className="log-section">
      <div className="log-title">Sistem Logları</div>
      <div className="log-container">
        {log.map((entry, i) => (
          <div key={i} className="log-entry">
            {entry}
          </div>
        ))}
        {log.length === 0 && (
          <div className="log-empty">Henüz log kaydı yok</div>
        )}
      </div>
    </div>
  )
}

// Bildirim ekleme fonksiyonu
function useNotification(notifications, setNotifications) {
  return (text) => {
    const id = Date.now() + Math.random()
    setNotifications(prev => [{ id, text, entering: true }, ...prev.slice(0, 4)])
    // Giriş animasyonu bittikten sonra entering sınıfını kaldır
    setTimeout(() => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, entering: false } : n))
    }, 400)
    // 5 saniye sonra çıkış animasyonu başlat
    setTimeout(() => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, exiting: true } : n))
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }, 330) // 320ms CSS + buffer
    }, 5000)
  }
}

// Bildirim kutucuğu
function NotificationBox({ notifications }) {
  return (
    <div className="notification-box">
      {notifications.map(n => (
        <div 
          key={n.id} 
          className={`notification-item ${n.entering ? 'entering' : ''} ${n.exiting ? 'exiting' : ''}`}
        >
          {n.text}
        </div>
      ))}
    </div>
  )
}

// Add this new component at the end of the file:
function OtomasyonModal({ open, onClose }) {
  console.log('OtomasyonModal rendered, open:', open);
  const { oxygenCleaning, fuelCleaning, preBurning, burning, burningStart, startEmergencyShutdown, resetSystem } = useContext(DataContext);
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.45)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '28vw', // 37.5vw * 0.75
        minWidth: 360,   // 480 * 0.75
        height: '56.25vh',  // 75vh * 0.75
        minHeight: 337,  // 450 * 0.75
        background: '#18181b',
        borderRadius: 16,
        boxShadow: '0 4px 32px #000a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        fontFamily: 'inherit',
        color: '#fff',
        padding: 36, // 48 * 0.75
      }}>
        <button onClick={onClose} style={{
          position: 'absolute',
          top: 18, // 24 * 0.75
          right: 24, // 32 * 0.75
          background: 'none',
          border: 'none',
          color: '#fff',
          fontSize: 27, // 36 * 0.75
          cursor: 'pointer',
          fontWeight: 700,
          zIndex: 2
        }}>×</button>
        <div style={{ fontSize: 25, fontWeight: 700, marginBottom: 18, textAlign: 'center', width: '100%' }}>Otomasyon Ayarları</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
          <button
            style={{
              padding: '16px 0',
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 700,
              background: '#f59e0b',
              color: '#fff',
              border: 'none',
              width: '100%',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={preBurning}
          >
            Pre-Burning (P)
          </button>
          <button
            style={{
              padding: '16px 0',
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 700,
              background: '#fbbf24',
              color: '#18181b',
              border: 'none',
              width: '100%',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={burningStart}
          >
            Burning Start (S)
          </button>
          <button
            style={{
              padding: '16px 0',
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 700,
              background: '#ea580c',
              color: '#fff',
              border: 'none',
              width: '100%',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={burning}
          >
            Burning (B)
          </button>
          <button
            style={{
              padding: '16px 0',
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 700,
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              width: '100%',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={startEmergencyShutdown}
          >
            🚨 Acil Durum (E)
          </button>
          <button
            style={{
              padding: '16px 0',
              borderRadius: 10,
              fontSize: 18,
              fontWeight: 700,
              background: '#64748b',
              color: '#fff',
              border: 'none',
              width: '100%',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={resetSystem}
          >
            Sistem Sıfırla (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

export default App
