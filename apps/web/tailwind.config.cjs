const path = require('path')

module.exports = {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        ink: '#1d1b16',
        cocoa: '#6f5f4b',
        sand: '#efe7da',
        clay: '#d9c6aa',
        ember: '#d97742',
        pine: '#2f5d50',
        sky: '#7fb3c8',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Work Sans"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 50px -24px rgba(29, 27, 22, 0.45)',
      },
    },
  },
  plugins: [],
}
