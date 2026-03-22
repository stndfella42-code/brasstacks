// Sticky Header
const header = document.getElementById('header');

window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

// Video Controls
const video = document.getElementById('bg-video');
const toggleBtn = document.getElementById('video-toggle');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

if (toggleBtn && video) {
  toggleBtn.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      iconPlay.style.display = 'none';
      iconPause.style.display = 'block';
    } else {
      video.pause();
      iconPlay.style.display = 'block';
      iconPause.style.display = 'none';
    }
  });
}

console.log('Brass Tacks website scripts loaded.');
