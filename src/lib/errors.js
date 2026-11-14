// Every failure gets a specific title, what happened, and what the user can do.

export function describeWeatherError(err, cityName = 'this city') {
  switch (err?.kind) {
    case 'offline':
      return {
        title: "You're offline",
        detail: `We couldn't load the weather for ${cityName} because this device isn't connected to the internet. Reconnect and we'll refresh automatically, or tap Retry.`,
      }
    case 'timeout':
      return {
        title: 'The weather service is too slow to respond',
        detail: `Neither weather provider answered within 8 seconds. Your connection may be slow or the services busy — tap Retry in a moment.`,
      }
    case 'rate-limit':
      return {
        title: 'Weather services are busy',
        detail: 'Both weather providers are limiting requests right now. Wait about a minute, then tap Retry.',
      }
    case 'server':
      return {
        title: 'The weather service is having problems',
        detail: 'Both weather providers returned a server error. This is usually temporary — try again in a minute.',
      }
    case 'network':
      return {
        title: "We couldn't reach the weather service",
        detail:
          "The request didn't get through. Check your connection, VPN or any ad/content blocker, then tap Retry.",
      }
    case 'not-found':
      return {
        title: `No weather data for ${cityName}`,
        detail: 'The provider has no forecast for this location. Try a nearby larger city.',
      }
    default:
      return {
        title: 'The weather data came back in an unexpected format',
        detail: "That's on our side, not yours. Tap Retry, or pick a different city.",
      }
  }
}

export function describeSearchError(err) {
  switch (err?.kind) {
    case 'offline':
      return "You're offline, so we can't look up new cities. Reconnect to search — the last city you viewed is still available."
    case 'rate-limit':
      return 'City search is getting too many requests. Pause for a second and keep typing.'
    case 'timeout':
      return 'City search is responding slowly. Check your connection and try again.'
    default:
      return "We couldn't load city suggestions. Check your connection and try again."
  }
}

export function validateCityQuery(value, pattern) {
  const v = value.trim()
  if (!v) return 'Enter a city name to search.'
  if (v.length < 2) return 'Type at least 2 letters of the city name.'
  if (v.length > 80) return 'That’s too long for a city name — try just the city, e.g. “Lahore”.'
  if (!pattern.test(v)) {
    return 'City names can only contain letters, spaces, hyphens, apostrophes and periods — remove numbers or symbols.'
  }
  return null
}
