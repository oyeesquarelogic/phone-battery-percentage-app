# Android Battery Monitor (Native Kotlin)

This documentation provides the native Android implementation requested.

## 📂 Project Structure
- `MainActivity.kt`: The main logic and BroadcastReceiver.
- `activity_main.xml`: The UI layout.
- `AndroidManifest.xml`: Permissions.

---

## 🔑 Required Permissions
Add this to your `AndroidManifest.xml`:
```xml
<!-- No special permissions are required for basic battery monitoring -->
<manifest ...>
    <application ...>
        ...
    </application>
</manifest>
```

---

## 📱 Main Activity (Kotlin)
```kotlin
package com.example.batterymonitor

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var batteryPercentText: TextView
    private lateinit var batteryStatusText: TextView
    private lateinit var batteryHealthText: TextView

    // 📻 BroadcastReceiver to listen for battery changes
    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent?.let {
                // 1. Get Battery Percentage
                val level = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                val batteryPct = (level.toFloat() / scale.toFloat() * 100).toInt()
                batteryPercentText.text = "$batteryPct%"

                // 2. Get Charging Status
                val status = it.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                val statusString = when (status) {
                    BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
                    BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
                    BatteryManager.BATTERY_STATUS_FULL -> "Full"
                    BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not Charging"
                    else -> "Unknown"
                }
                batteryStatusText.text = "Status: $statusString"

                // 3. Get Battery Health
                val health = it.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)
                val healthString = when (health) {
                    BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
                    BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheat"
                    BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
                    BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over Voltage"
                    BatteryManager.BATTERY_HEALTH_COLD -> "Cold"
                    BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "Failure"
                    else -> "Unknown"
                }
                batteryHealthText.text = "Health: $healthString"
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        batteryPercentText = findViewById(R.id.batteryPercent)
        batteryStatusText = findViewById(R.id.batteryStatus)
        batteryHealthText = findViewById(R.id.batteryHealth)
    }

    override fun onResume() {
        super.onResume()
        // Register the receiver
        registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    }

    override fun onPause() {
        super.onPause()
        // Unregister to save resources
        unregisterReceiver(batteryReceiver)
    }
}
```

---

## 🎨 UI Layout (XML)
`res/layout/activity_main.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:padding="24dp"
    android:background="#F5F5F5">

    <TextView
        android:id="@+id/batteryPercent"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="0%"
        android:textSize="80sp"
        android:textStyle="bold"
        android:textColor="#333333" />

    <TextView
        android:id="@+id/batteryStatus"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Status: Unknown"
        android:textSize="18sp"
        android:layout_marginTop="16dp" />

    <TextView
        android:id="@+id/batteryHealth"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Health: Unknown"
        android:textSize="18sp"
        android:layout_marginTop="8dp" />

</LinearLayout>
```

---

## 🚀 Step-by-Step Instructions
1. Open **Android Studio**.
2. Create a new project with **Empty Activity**.
3. Select **Kotlin** as the language.
4. Copy the XML code into `res/layout/activity_main.xml`.
5. Copy the Kotlin code into `MainActivity.kt`.
6. Connect your Android phone or use an emulator.
7. Click **Run** (Green Play Button).
