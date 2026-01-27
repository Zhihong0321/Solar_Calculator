# Integration Guide: Malaysia Solar PV API

This document provides the technical details for integrating the Solar PV Potential Mapper into external applications.

## 1. Overview
The API converts a physical address into a specific solar yield value ($kWh/kWp$) by geocoding the address and sampling color data from a reference Malaysia PVOUT map.

**Base URL:** `https://solar-analysis-app-production.up.railway.app`

---

## 2. API Endpoint

### `GET /api/solar-widget`
Fetch solar data and a visual UI widget for a specific address.

#### **Request Parameters**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `address` | String | Yes | The full address in Malaysia (e.g., "Petronas Twin Towers, KL") |

#### **Sample Request**
```bash
curl -G "https://solar-analysis-app-production.up.railway.app/api/solar-widget" \
  --data-urlencode "address=Petronas Twin Towers, Kuala Lumpur"
```

---

## 3. Return Payload (JSON)
The API returns a JSON object containing raw metrics and ready-to-use HTML.

```json
{
  "address": "Lower Ground Level, Menara Berkembar Petronas, 50088 Kuala Lumpur",
  "location": {
    "lat": 3.1574693,
    "lng": 101.7115639
  },
  "solar_data": {
    "match": {
      "label": "Very High",
      "range": "4.2+",
      "yearly_kwh": "1534+",
      "rgb": [178, 24, 43]
    },
    "pixel": { "x": 171, "y": 68 }
  },
  "map_image_url": "https://solar-analysis-app-production.up.railway.app/image.png",
  "widget_html": "<div style='...'>...</div>"
}
```

### **Data Definitions**
*   **`match.label`**: Descriptive sun intensity (Low to Very High).
*   **`match.range`**: Daily PV yield in $kWh/kWp$.
*   **`match.yearly_kwh`**: Estimated yearly total in $kWh/kWp$.
*   **`widget_html`**: A fully self-contained HTML/CSS block for a 360x360px display.

---

## 4. UI Implementation

### **Method A: Direct Injection**
Simply inject the `widget_html` string directly into your frontend. It is pre-styled and self-contained.

```javascript
const response = await fetch(API_URL);
const data = await response.json();
document.getElementById('solar-container').innerHTML = data.widget_html;
```

### **Method B: Custom Image Centering Logic**
If you wish to build a custom UI using the `map_image_url`:

1.  **Container:** Create a `360x360px` box with `overflow: hidden` and `position: relative`.
2.  **Background Position:**
    *   `X = 180 - solar_data.pixel.x`
    *   `Y = 180 - solar_data.pixel.y`
3.  **Visual:** Apply these to the `background-position` of your container to center the target location.
4.  **Pin:** Overlay a pin/marker at the exact center (`180, 180`) of the box.

---

## 5. Deployment & Limits
*   **CORS:** Enabled (`*`).
*   **Boundaries:** Supports Malaysia only (Lat 0.5°N to 7.5°N, Lng 98.5°E to 119.5°E).
*   **Security:** Standard Google API keys are used; no URL signing is required for client-side geocoding.

```