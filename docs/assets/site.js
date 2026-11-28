// The chapter menu is open on a wide window, where it is the rail. On a narrow one it starts closed,
// so a page opens on its text and not on a list of chapters.
const menu = document.querySelector('.menu')
const narrow = window.matchMedia('(max-width: 900px)')
const fit = () => {
  if (menu) menu.open = !narrow.matches
}
fit()
narrow.addEventListener('change', fit)
