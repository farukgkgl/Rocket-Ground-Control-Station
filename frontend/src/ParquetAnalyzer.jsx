import React, { useState, useEffect, useContext } from 'react';
import { Line } from 'react-chartjs-2';
import './ParquetAnalyzer.css';
import { DataContext, API_URL } from './App';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const ParquetAnalyzer = () => {
  const [parquetFiles, setParquetFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Context'ten geri dönüş fonksiyonunu al
  const { setShowParquetAnalyzer } = useContext(DataContext);

  // Parquet dosyalarını listele
  const fetchParquetFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/parquet_files`);
      if (response.ok) {
        const files = await response.json();
        setParquetFiles(files);
      } else {
        setError('Parquet dosyaları listelenemedi');
      }
    } catch (err) {
      setError('Bağlantı hatası: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Dosya seçildiğinde veriyi yükle
  const loadFileData = async (filename) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/parquet_data/${encodeURIComponent(filename)}`);
      if (response.ok) {
        const data = await response.json();
        setFileData(data);
        setSelectedFile(filename);
      } else {
        setError('Dosya yüklenemedi');
      }
    } catch (err) {
      setError('Dosya yükleme hatası: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Grafik çiz
  const plotChart = (columnName) => {
    if (!fileData || !columnName) return;

    const columnData = fileData.data[columnName];
    const timestamps = fileData.data.timestamp || Array.from({ length: columnData.length }, (_, i) => i);

    // Zaman etiketlerini hazırla (ilk timestamp referans alınır, geçen süre saniye.cinsinden)
    const startTime = timestamps[0];
    const timeLabels = timestamps.map(ts => (ts - startTime).toFixed(3));

    // Hareketli ortalama (moving average)
    function movingAverage(arr, windowSize = 20) {
      if (windowSize < 2) return arr.slice();
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = arr.slice(start, i + 1);
        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        result.push(avg);
      }
      return result;
    }

    const movingAvgData = movingAverage(columnData, 20); // 20 örneklik pencere

    // Dinamik min/max ve padding hesapla
    const maxVal = Math.max(...columnData);
    const padding = maxVal === 0 ? 1 : maxVal * 0.05;
    const yMin = 0;
    const yMax = maxVal + padding;

    let displayColumnName = columnName;
    
    // Oksijen ve fuel consumption'ları D1/D2 olarak göster
    if (columnName.toLowerCase().includes('oxygen') || columnName.toLowerCase().includes('oxygen_debisi')) {
      displayColumnName = 'D1 - Oksijen Debisi';
    } else if (columnName.toLowerCase().includes('fuel') || columnName.toLowerCase().includes('fuel_debisi')) {
      displayColumnName = 'D2 - Yakıt Debisi';
    }

    const chartConfig = {
      labels: timeLabels,
      datasets: [
        {
          label: displayColumnName + ' (Hareketli Ortalama)',
          data: movingAvgData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.10)',
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    };

    // Dinamik chart options (y ekseni min/max)
    const dynamicChartOptions = {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: {
          ...chartOptions.scales.y,
          min: yMin,
          max: yMax,
        }
      }
    };

    setChartData({ config: chartConfig, options: dynamicChartOptions });
    setSelectedColumn(columnName);
  };

  // Sütunları kategorilere ayır
  const categorizeColumns = (columns) => {
    // Pressure: P1, P2, ..., P8 (case-insensitive, allow gaps)
    const pressureCols = columns.filter(col => /^P\d+$/i.test(col));
    // Temperature: T1, T2, ..., T6 + Tbogaz1, Tbogaz2 (case-insensitive, allow gaps)
    const tempCols = columns.filter(col => /^T\d+$/i.test(col) || col.toLowerCase() === 'tbogaz1' || col.toLowerCase() === 'tbogaz2');
    // Flow: sadece oxygen ve fuel consumption (D1/D2 ve debi1/debi2 hariç)
    const flowCols = columns.filter(col =>
      (col.toLowerCase().includes('oxygen') || col.toLowerCase().includes('fuel')) &&
      !/^d\d+$/i.test(col) &&
      !col.toLowerCase().includes('debi')
    );
    // Performance: match STM32 output field names (case-insensitive)
    const performanceKnown = [
      'THRUST', 'ISP', 'ADIABATIC', 'PCHAMBER',
      'IMPULSE', 'VELOCITY'
    ];
    // Find columns that match performanceKnown, case-insensitive
    const performanceCols = columns.filter(col => performanceKnown.includes(col.toUpperCase()));
    // Other: not in above, D1/D2/debi1/debi2 hariç
    const otherCols = columns.filter(col =>
      !pressureCols.includes(col) &&
      !tempCols.includes(col) &&
      !flowCols.includes(col) &&
      !performanceCols.includes(col) &&
      col.toLowerCase() !== 'timestamp' &&
      !/^d\d+$/i.test(col) &&
      !col.toLowerCase().includes('debi')
    );
    return {
      pressure: pressureCols,
      temperature: tempCols,
      flow: flowCols,
      performance: performanceCols,
      other: otherCols
    };
  };

  useEffect(() => {
    fetchParquetFiles();
  }, []);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e2e8f0',
          font: {
            size: 14,
            weight: 'bold'
          },
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      title: {
        display: true,
        text: (() => {
          if (!selectedColumn) return 'Grafik';
          if (selectedColumn.toLowerCase().includes('oxygen') || selectedColumn.toLowerCase().includes('oxygen_debisi')) {
            return 'D1 - Oksijen Debisi - Zaman Grafiği';
          } else if (selectedColumn.toLowerCase().includes('fuel') || selectedColumn.toLowerCase().includes('fuel_debisi')) {
            return 'D2 - Yakıt Debisi - Zaman Grafiği';
          }
          return `${selectedColumn} - Zaman Grafiği`;
        })(),
        color: '#f1f5f9',
        font: {
          size: 18,
          weight: 'bold'
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#e2e8f0',
        borderColor: '#475569',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: function(context) {
            return `Zaman: ${context[0].label}`;
          },
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Zaman',
          color: '#94a3b8',
          font: {
            size: 14,
            weight: 'bold'
          }
        },
        ticks: {
          color: '#94a3b8',
          maxTicksLimit: 10,
          maxRotation: 45
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
          drawBorder: false
        }
      },
              y: {
          title: {
            display: true,
            text: selectedColumn || 'Değer',
            color: '#94a3b8',
            font: {
              size: 14,
              weight: 'bold'
            }
          },
        ticks: {
          color: '#94a3b8',
          callback: function(value) {
            return value.toFixed(2);
          }
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
          drawBorder: false
        }
      }
    },
    elements: {
      point: {
        hoverRadius: 8,
        hoverBorderWidth: 3
      }
    }
  };

  if (loading) {
    return (
      <div className="parquet-analyzer">
        <div className="loading">
          <div className="spinner"></div>
          <p>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="parquet-analyzer">
      <div className="analyzer-header">
        <h2>📊 Parquet Dosya Analizi</h2>
        <div className="header-buttons">
          <button onClick={fetchParquetFiles} className="refresh-btn">
            🔄 Yenile
          </button>
          <button 
            onClick={() => setShowParquetAnalyzer(false)} 
            className="back-btn"
          >
            ← Geri Dön
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Dosya Listesi */}
      <div className="file-section">
        <h3>📁 Parquet Dosyaları</h3>
        {parquetFiles.length === 0 ? (
          <p>Parquet dosyası bulunamadı</p>
        ) : (
          <div className="file-list">
            {parquetFiles.map((file, index) => (
              <button
                key={index}
                onClick={() => loadFileData(file.name)}
                className={`file-btn ${selectedFile === file.name ? 'active' : ''}`}
              >
                📄 {file.name}
                <span className="file-size">({file.size} KB)</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dosya Verisi */}
      {fileData && (
        <div className="data-section">
          <h3>📈 Veri Analizi: {selectedFile}</h3>
          <p>Satır sayısı: {fileData.rowCount}</p>

          {/* Sütun Kategorileri */}
          <div className="column-categories">
            {(() => {
              const categories = categorizeColumns(fileData.columns);
              return (
                <>
                  {categories.temperature.length > 0 && (
                    <div className="category">
                      <h4>🌡️ Sıcaklık Sensörleri</h4>
                      <div className="column-buttons">
                        {categories.temperature.map(col => (
                          <button
                            key={col}
                            onClick={() => plotChart(col)}
                            className={`column-btn ${selectedColumn === col ? 'active' : ''}`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {categories.pressure.length > 0 && (
                    <div className="category">
                      <h4> ⏲ Basınç Sensörleri</h4>
                      <div className="column-buttons">
                        {categories.pressure.map(col => (
                          <button
                            key={col}
                            onClick={() => plotChart(col)}
                            className={`column-btn ${selectedColumn === col ? 'active' : ''}`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {categories.flow.length > 0 && (
                    <div className="category">
                      <h4>💧 Debiler</h4>
                      <div className="column-buttons">
                        {categories.flow.map(col => {
                          let displayName = col;
                          if (col.toLowerCase().includes('oxygen') || col.toLowerCase().includes('oxygen_debisi')) {
                            displayName = 'D1 - Oksijen Debisi';
                          } else if (col.toLowerCase().includes('fuel') || col.toLowerCase().includes('fuel_debisi')) {
                            displayName = 'D2 - Yakıt Debisi';
                          }
                          return (
                            <button
                              key={col}
                              onClick={() => plotChart(col)}
                              className={`column-btn ${selectedColumn === col ? 'active' : ''}`}
                            >
                              {displayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {categories.performance.length > 0 && (
                    <div className="category">
                      <h4>🚀 Performans Verileri</h4>
                      <div className="column-buttons">
                        {categories.performance.map(col => (
                          <button
                            key={col}
                            onClick={() => plotChart(col)}
                            className={`column-btn ${selectedColumn === col ? 'active' : ''}`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {categories.other.length > 0 && (
                    <div className="category">
                      <h4>📊 Diğer Veriler</h4>
                      <div className="column-buttons">
                        {categories.other.map(col => (
                          <button
                            key={col}
                            onClick={() => plotChart(col)}
                            className={`column-btn ${selectedColumn === col ? 'active' : ''}`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Grafik */}
      {chartData && (
        <div className="chart-section">
          <h3>📊 Grafik: {selectedColumn}</h3>
          <div className="chart-container" style={{ height: '500px', position: 'relative' }}>
            <Line data={chartData.config} options={chartData.options} />
          </div>
          
          {/* İstatistikler */}
          {fileData && selectedColumn && (
            <div className="statistics">
              <h4>📈 İstatistikler</h4>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Ortalama:</span>
                  <span className="stat-value">
                    {(fileData.data[selectedColumn].reduce((a, b) => a + b, 0) / fileData.data[selectedColumn].length).toFixed(3)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Maksimum:</span>
                  <span className="stat-value">
                    {Math.max(...fileData.data[selectedColumn]).toFixed(3)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Minimum:</span>
                  <span className="stat-value">
                    {Math.min(...fileData.data[selectedColumn]).toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ParquetAnalyzer; 