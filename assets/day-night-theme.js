(function () {
  const DAY_START = 7;   // 07:00 local time
  const NIGHT_START = 19; // 19:00 local time

  function applyTimeTheme() {
    const hour = new Date().getHours();
    const theme = (hour >= DAY_START && hour < NIGHT_START) ? 'day' : 'night';
    document.documentElement.dataset.timeTheme = theme;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute('content', theme === 'night' ? '#050c16' : '#061a3a');
    }
  }

  applyTimeTheme();
  window.setInterval(applyTimeTheme, 60000);
})();
