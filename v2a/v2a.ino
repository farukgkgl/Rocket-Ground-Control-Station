// Motor 1 pinleri
#define STEP_PIN_1 2
#define DIR_PIN_1 3
#define EN_PIN_1 4

// Motor 2 pinleri
#define STEP_PIN_2 5
#define DIR_PIN_2 6
#define EN_PIN_2 7

// ==================== SABİTLER ====================
const int stepDelay = 5000;              // TB6560 için yavaş hız (mikrosaniye)
const double MIN_ANGLE = -1727.5;        // Kapalı limit
const double MAX_ANGLE = 1727.5;         // Açık limit
const unsigned long debounceDelay = 500; // Komut arası minimum süre (ms)

// ==================== DURUM DEĞİŞKENLERİ ====================
double currentAngle1 = MIN_ANGLE;
double currentAngle2 = MIN_ANGLE;
String inputString = "";
bool inputComplete = false;
unsigned long lastRunTime = 0;
unsigned long lastStatusTime = 0;

// ==================== FONKSİYONLAR ====================

// Adım başına derece dönüşümü (şu an sabit)
double getStepsPerRevForAngle(double angle) {
  return 202.8; // Her durumda aynı
}

// Motoru döndürme fonksiyonu
bool rotateMotor(int motorId, float deltaAngle) {
  double* currentAngle = (motorId == 1) ? &currentAngle1 : &currentAngle2;
  int stepPin = (motorId == 1) ? STEP_PIN_1 : STEP_PIN_2;
  int dirPin  = (motorId == 1) ? DIR_PIN_1  : DIR_PIN_2;

  float targetAngle = *currentAngle + deltaAngle;

  // Limit kontrolü
  if (targetAngle < MIN_ANGLE) {
    deltaAngle = MIN_ANGLE - *currentAngle;
    targetAngle = MIN_ANGLE;
  } else if (targetAngle > MAX_ANGLE) {
    deltaAngle = MAX_ANGLE - *currentAngle;
    targetAngle = MAX_ANGLE;
  }

  // Eğer hareket edilecek açı çok küçükse çık
  if (abs(deltaAngle) < 0.1) {
    Serial.println("Hareket edilecek açı çok küçük, motor dönmeyecek");
    return false;
  }

  // Adım sayısını hesapla - BU KISIM ÖNEMLİ!
  double stepsPerRev = getStepsPerRevForAngle(targetAngle);
  int stepsToTake = round(abs(deltaAngle) * stepsPerRev / 360.0);

  Serial.print("Motor ");
  Serial.print(motorId);
  Serial.print(" için ");
  Serial.print(stepsToTake);
  Serial.print(" adım döndürülecek (");
  Serial.print(deltaAngle);
  Serial.println("°)");

  // Yön belirle - TB6560 için düzeltildi
  bool direction = (deltaAngle > 0);  // Pozitif açı için HIGH'a geri döndüm
  digitalWrite(dirPin, direction ? LOW : HIGH);
  
  Serial.print("Yön sinyali: ");
  Serial.print(direction ? "HIGH" : "LOW");
  Serial.print(" (deltaAngle: ");
  Serial.print(deltaAngle);
  Serial.println(")");
  
  // TB6560 için daha uzun setup süresi
  delay(50);

  // Motoru döndür - TB6560 için özel timing
  for (int i = 0; i < stepsToTake; i++) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(stepDelay);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(stepDelay);
    
    // TB6560 bazen ek bekleme süresi istiyor
    if (i % 10 == 0) {
      delayMicroseconds(100);
    }
    
    // Her 50 adımda bir durum bildir (büyük hareketlerde)
    if (stepsToTake > 50 && i % 50 == 0) {
      Serial.print("Adım: ");
      Serial.print(i);
      Serial.print("/");
      Serial.println(stepsToTake);
    }
  }

  *currentAngle = targetAngle;
  
  Serial.print("Motor ");
  Serial.print(motorId);
  Serial.println(" hareketi tamamlandı");
  
  return true;
}

// Komut işleme fonksiyonu
void processCommand(String command) {
  command.trim();
  if (command.length() == 0) return;

  Serial.print("Alınan komut: ");
  Serial.println(command);

  // Komutu "motor_id:açı" formatında parçala
  int colonIndex = command.indexOf(':');
  if (colonIndex == -1) {
    Serial.println("ERR: Format motor_id:açı");
    return;
  }

  int motorId = command.substring(0, colonIndex).toInt();
  float deltaAngle = command.substring(colonIndex + 1).toFloat();

  Serial.print("Motor ID: ");
  Serial.print(motorId);
  Serial.print(", Delta Açı: ");
  Serial.println(deltaAngle);

  if (motorId != 1 && motorId != 2) {
    Serial.println("ERR: Motor ID 1 veya 2 olmalı");
    return;
  }

  if (abs(deltaAngle) < 0.001) {
    Serial.println("Motor hareket etmeyecek (0°)");
    return;
  }

  // Mevcut pozisyonu bildir
  if (motorId == 1) {
    Serial.print("Motor1 mevcut pozisyon: ");
    Serial.println(currentAngle1);
  } else {
    Serial.print("Motor2 mevcut pozisyon: ");
    Serial.println(currentAngle2);
  }

  bool success = rotateMotor(motorId, deltaAngle);

  // Yeni pozisyonu bildir
  if (success) {
    if (motorId == 1) {
      Serial.print("Motor1 yeni pozisyon: ");
      Serial.println(currentAngle1);
    } else {
      Serial.print("Motor2 yeni pozisyon: ");
      Serial.println(currentAngle2);
    }
  } else {
    Serial.println("Motor hareketi başarısız!");
  }
}

// ==================== SETUP ====================
void setup() {
  // Motor pinlerini çıkış olarak ayarla
  pinMode(STEP_PIN_1, OUTPUT);
  pinMode(DIR_PIN_1, OUTPUT);
  pinMode(EN_PIN_1, OUTPUT);

  pinMode(STEP_PIN_2, OUTPUT);
  pinMode(DIR_PIN_2, OUTPUT);
  pinMode(EN_PIN_2, OUTPUT);

  // Başlangıçta pinleri LOW yap
  digitalWrite(STEP_PIN_1, LOW);
  digitalWrite(DIR_PIN_1, LOW);
  digitalWrite(STEP_PIN_2, LOW);
  digitalWrite(DIR_PIN_2, LOW);

  // Motorları aktif et (TB6560 için EN pinleri HIGH = aktif)
  digitalWrite(EN_PIN_1, LOW);
  digitalWrite(EN_PIN_2, LOW);

  // Baud rate 9600
  Serial.begin(115200);
  
  // Başlangıç mesajları
  Serial.println("=== STEP MOTOR SISTEMI HAZIR ===");
  Serial.println("Komut: motor_id:açı (örn: 1:90)");
  Serial.print("Motor1 başlangıç pozisyonu: ");
  Serial.println(currentAngle1);
  Serial.print("Motor2 başlangıç pozisyonu: ");
  Serial.println(currentAngle2);
  
  delay(1000); // Başlangıçta 1 saniye bekle
}

// ==================== LOOP ====================
void loop() {
  // Seri porttan komut oku
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '\n' || inChar == '\r') {
      inputComplete = true;
    } else {
      inputString += inChar;
    }
  }

  // Komut hazırsa işle
  if (inputComplete && (millis() - lastRunTime > debounceDelay)) {
    processCommand(inputString);
    inputString = "";
    inputComplete = false;
    lastRunTime = millis();
  }

  // Her 30 saniyede bir sistem durumu bildir
  if (millis() - lastStatusTime > 30000) {
    Serial.println("Sistem aktif - yeni komut bekleniyor...");
    Serial.print("Motor1: ");
    Serial.print(currentAngle1);
    Serial.print("°, Motor2: ");
    Serial.print(currentAngle2);
    Serial.println("°");
    lastStatusTime = millis();
  }
}