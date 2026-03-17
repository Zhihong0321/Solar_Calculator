module.exports = {
  content: [
    './public/**/*.{html,js}',
    './src/**/*.{js,html}',
    './routes/**/*.js',
    './server.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      },
      colors: {
        paper: '#FAF9F6',
        fact: '#000000',
        label: '#404040',
        context: '#666666',
        divider: '#D1D5DB',
        primary: '#000000'
      }
    }
  },
  plugins: []
};
