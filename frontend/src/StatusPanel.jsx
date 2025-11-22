import React, { useEffect, useRef, useState, forwardRef, useContext } from 'react';
import './StatusPanel.css';
import { Line } from 'react-chartjs-2';
import { DataContext } from './App';

function getSensorLabel(index) {
  if (index < 6) return `T${index + 1}`;
  if (index < 14) {
    if (index === 12) return 'P1Chamber';
    if (index === 13) return 'P2Chamber';
    return `P${index - 5}`; // P1-P6
  }
  if (index === 14) return 'Tbogaz1';
  if (index === 15) return 'Tbogaz2';
  if (index === 16) return 'O2_Tuketim';  // D1 verisi
  if (index === 17) return 'Yakit_Tuketim';  // D2 verisi
  if (index === 18) return 'ISP';
  if (index === 19) return 'Thrust';
  if (index === 20) return 'Egzoz_Hizi';
  if (index === 21) return 'Total_Impulse';
  return '';
}

const StatusPanel = forwardRef(function StatusPanel({ sensorIndex, onClose, sensors, style }, ref) {
  const { sensors: realTimeSensors } = useContext(DataContext);
  
  // Gerçek zamanlı sensör verilerini kullan
  const currentSensors = realTimeSensors || sensors;
  
  // Sensör değerini al (sıcaklık, basınç, debi veya performans verileri)
  let value = '';
  if (sensorIndex < 6) {
    // T1-T6 (sıcaklık)
    value = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[sensorIndex] !== undefined
      ? `${currentSensors.temperatures[sensorIndex]?.toFixed(3)} °C`
      : 'N/A';
  } else if (sensorIndex < 14) {
    // P1-P8 (basınç)
    const pIdx = sensorIndex - 6;
    value = Array.isArray(currentSensors.pressures) && currentSensors.pressures[pIdx] !== undefined
      ? `${currentSensors.pressures[pIdx]?.toFixed(3)} bar`
      : 'N/A';
      } else if (sensorIndex === 14) {
      // Tbogaz1 (sıcaklık)
      value = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[6] !== undefined
        ? `${currentSensors.temperatures[6]?.toFixed(3)} °C`
        : 'N/A';
    } else if (sensorIndex === 15) {
      // Tbogaz2 (sıcaklık)
      value = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[7] !== undefined
        ? `${currentSensors.temperatures[7]?.toFixed(3)} °C`
        : 'N/A';
    } else if (sensorIndex === 16) {
      // O2_Tuketim (D1 verisi)
      value = currentSensors.oxygen_consumption !== undefined ? `${currentSensors.oxygen_consumption?.toFixed(2)} Kg/s` : 'N/A';
    } else if (sensorIndex === 17) {
      // Yakit_Tuketim (D2 verisi)
      value = currentSensors.fuel_consumption !== undefined ? `${currentSensors.fuel_consumption?.toFixed(2)} Kg/s` : 'N/A';
    } else if (sensorIndex === 18) {
      // ISP
      value = currentSensors.isp !== undefined ? `${currentSensors.isp?.toFixed(3)} s` : 'N/A';
    } else if (sensorIndex === 19) {
      // Thrust
      value = currentSensors.thrust !== undefined ? `${currentSensors.thrust?.toFixed(3)} N` : 'N/A';
    } else if (sensorIndex === 20) {
      // Egzoz_Hizi
      value = currentSensors.exhaust_velocity !== undefined ? `${currentSensors.exhaust_velocity?.toFixed(0)} m/s` : 'N/A';
    } else if (sensorIndex === 21) {
      // Total_Impulse
      value = currentSensors.total_impulse !== undefined ? `${currentSensors.total_impulse?.toFixed(0)} Ns` : 'N/A';
    }

  // Gerçek zamanlı history state'i
  const [timeSeries, setTimeSeries] = useState([]);

  // Gerçek zamanlı veri güncellemesi
  useEffect(() => {
    let currentValue = null;
    if (sensorIndex < 6) {
      currentValue = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[sensorIndex] !== undefined
        ? currentSensors.temperatures[sensorIndex]
        : null;
    } else if (sensorIndex < 14) {
      const pIdx = sensorIndex - 6;
      currentValue = Array.isArray(currentSensors.pressures) && currentSensors.pressures[pIdx] !== undefined
        ? currentSensors.pressures[pIdx]
        : null;
    } else if (sensorIndex === 14) {
      currentValue = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[6] !== undefined
        ? currentSensors.temperatures[6]
        : null;
    } else if (sensorIndex === 15) {
      currentValue = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[7] !== undefined
        ? currentSensors.temperatures[7]
        : null;
    } else if (sensorIndex === 16) {
      currentValue = currentSensors.oxygen_consumption !== undefined ? currentSensors.oxygen_consumption : null;
    } else if (sensorIndex === 17) {
      currentValue = currentSensors.fuel_consumption !== undefined ? currentSensors.fuel_consumption : null;
    } else if (sensorIndex === 18) {
      currentValue = currentSensors.isp !== undefined ? currentSensors.isp : null;
    } else if (sensorIndex === 19) {
      currentValue = currentSensors.thrust !== undefined ? currentSensors.thrust : null;
    } else if (sensorIndex === 20) {
      currentValue = currentSensors.exhaust_velocity !== undefined ? currentSensors.exhaust_velocity : null;
    } else if (sensorIndex === 21) {
      currentValue = currentSensors.total_impulse !== undefined ? currentSensors.total_impulse : null;
    }

    // Eğer geçerli bir değer varsa, time series'e ekle
    if (typeof currentValue === 'number' && !isNaN(currentValue)) {
      const now = new Date();
      setTimeSeries(prev => {
        const newSeries = [...prev, { t: now, v: currentValue }];
        // Son 50 veriyi tut (performans için)
        return newSeries.slice(-50);
      });
    }
  }, [sensorIndex, currentSensors]);

  // Gerçek zamanlı veri güncellemesi
  useEffect(() => {
    let currentValue = null;
    if (sensorIndex < 6) {
      currentValue = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[sensorIndex] !== undefined
        ? currentSensors.temperatures[sensorIndex]
        : null;
    } else if (sensorIndex < 14) {
      const pIdx = sensorIndex - 6;
      currentValue = Array.isArray(currentSensors.pressures) && currentSensors.pressures[pIdx] !== undefined
        ? currentSensors.pressures[pIdx]
        : null;
    } else if (sensorIndex === 14) {
      currentValue = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[6] !== undefined
        ? currentSensors.temperatures[6]
        : null;
    } else if (sensorIndex === 15) {
      currentValue = Array.isArray(currentSensors.temperatures) && currentSensors.temperatures[7] !== undefined
        ? currentSensors.temperatures[7]
        : null;
    } else if (sensorIndex === 16) {
      currentValue = currentSensors.oxygen_consumption !== undefined ? currentSensors.oxygen_consumption : null;
    } else if (sensorIndex === 17) {
      currentValue = currentSensors.fuel_consumption !== undefined ? currentSensors.fuel_consumption : null;
    } else if (sensorIndex === 18) {
      currentValue = currentSensors.isp !== undefined ? currentSensors.isp : null;
    } else if (sensorIndex === 19) {
      currentValue = currentSensors.thrust !== undefined ? currentSensors.thrust : null;
    } else if (sensorIndex === 20) {
      currentValue = currentSensors.exhaust_velocity !== undefined ? currentSensors.exhaust_velocity : null;
    } else if (sensorIndex === 21) {
      currentValue = currentSensors.total_impulse !== undefined ? currentSensors.total_impulse : null;
    }

    // Eğer geçerli bir değer varsa, time series'e ekle
    if (typeof currentValue === 'number' && !isNaN(currentValue)) {
      const now = new Date();
      setTimeSeries(prev => {
        const newSeries = [...prev, { t: now, v: currentValue }];
        // Son 50 veriyi tut (performans için)
        return newSeries.slice(-50);
      });
    }
  }, [sensorIndex, currentSensors]);

  // Gerçek zamanlı grafik verisi
  const chartData = {
    labels: timeSeries.map((_, i) => i),
    datasets: [
      {
        label: getSensorLabel(sensorIndex),
        data: timeSeries.map(d => d.v),
        fill: false,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        tension: 0.2,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#60a5fa',
        pointBorderColor: '#fff',
        borderWidth: 2,
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0 // Animasyonu kapat (gerçek zamanlı için)
    },
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: { 
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#60a5fa',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Zaman', color: '#e5e7eb', font: { size: 11, weight: 'bold' } },
        grid: { color: '#334155', drawBorder: false },
        ticks: { display: true, color: '#e5e7eb', font: { size: 10 } },
        border: { color: '#334155' }
      },
      y: {
        title: { 
          display: true, 
          text: sensorIndex < 6 ? '°C' : 
                sensorIndex < 14 ? 'bar' : 
                sensorIndex === 14 || sensorIndex === 15 ? '°C' :
                sensorIndex === 16 || sensorIndex === 17 ? 'Kg/s' :
                sensorIndex === 18 || sensorIndex === 19 ? 'Kg/s' :
                sensorIndex === 20 ? 's' :
                sensorIndex === 21 ? 'N' :
                sensorIndex === 22 ? 'm/s' :
                sensorIndex === 23 ? 'Ns' : 'Kg/s', 
          color: '#e5e7eb', 
          font: { size: 11, weight: 'bold' } 
        },
        grid: { color: '#334155', drawBorder: false },
        ticks: { color: '#e5e7eb', font: { size: 10 } },
        border: { color: '#334155' },
        // Dinamik min/max (veriye göre ayarla)
        min: timeSeries.length > 0 ? Math.min(...timeSeries.map(d => d.v)) * 0.9 : 0,
        max: timeSeries.length > 0 ? Math.max(...timeSeries.map(d => d.v)) * 1.1 : 100,
      },
    },
  };

  return (
    <div className="status-panel-root" style={style} ref={ref}>
      <button className="status-panel-close" onClick={onClose}>×</button>
      <div className="status-panel-title">
        {getSensorLabel(sensorIndex)} Durumu
        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
          {value} • {timeSeries.length} veri noktası
        </div>
      </div>
      <div className="status-panel-chart-placeholder" style={{ height: '200px', position: 'relative' }}>
        {timeSeries.length === 0 ? (
          <div style={{ 
            color: '#9ca3af', 
            textAlign: 'center', 
            padding: 24,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%'
          }}>
            Veri bekleniyor...
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
});

export default StatusPanel; 