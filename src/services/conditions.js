// Both providers are mapped onto one small set of conditions that drive the
// icons and the hero colours.
// condition: 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder'

export const CONDITION_LABEL = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  thunder: 'Thunderstorm',
}

/** OpenWeatherMap condition id → condition. https://openweathermap.org/weather-conditions */
export function fromOwmId(id) {
  if (id == null) return 'cloudy'
  if (id >= 200 && id < 300) return 'thunder'
  if (id >= 300 && id < 400) return 'drizzle'
  if (id >= 500 && id < 600) return 'rain'
  if (id >= 600 && id < 700) return 'snow'
  if (id >= 700 && id < 800) return 'fog'
  if (id === 800) return 'clear'
  if (id === 801 || id === 802) return 'partly-cloudy'
  return 'cloudy'
}

const WMO = {
  0: ['clear', 'Clear sky'],
  1: ['clear', 'Mainly clear'],
  2: ['partly-cloudy', 'Partly cloudy'],
  3: ['cloudy', 'Overcast'],
  45: ['fog', 'Fog'],
  48: ['fog', 'Freezing fog'],
  51: ['drizzle', 'Light drizzle'],
  53: ['drizzle', 'Drizzle'],
  55: ['drizzle', 'Heavy drizzle'],
  56: ['drizzle', 'Light freezing drizzle'],
  57: ['drizzle', 'Freezing drizzle'],
  61: ['rain', 'Light rain'],
  63: ['rain', 'Rain'],
  65: ['rain', 'Heavy rain'],
  66: ['rain', 'Light freezing rain'],
  67: ['rain', 'Freezing rain'],
  71: ['snow', 'Light snow'],
  73: ['snow', 'Snow'],
  75: ['snow', 'Heavy snow'],
  77: ['snow', 'Snow grains'],
  80: ['rain', 'Light showers'],
  81: ['rain', 'Showers'],
  82: ['rain', 'Heavy showers'],
  85: ['snow', 'Light snow showers'],
  86: ['snow', 'Snow showers'],
  95: ['thunder', 'Thunderstorm'],
  96: ['thunder', 'Thunderstorm with hail'],
  99: ['thunder', 'Severe thunderstorm with hail'],
}

/** Open-Meteo WMO weather code → condition. */
export function fromWmo(code) {
  return WMO[code]?.[0] ?? 'cloudy'
}

export function wmoDescription(code) {
  return WMO[code]?.[1] ?? 'Unknown conditions'
}
