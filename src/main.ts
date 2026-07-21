// TypeScript = BEHAVIOR. Building services: what happens when you click —
// how the page ACTS. (TypeScript is JavaScript with type-checking: it
// catches mistakes before they happen.)
//
// Hello-world: click the button, stack a floor, watch your tower grow.
// Delete all of this once you start your real project (see docs/plan/PRD.md).

const tower = document.querySelector<HTMLDivElement>('#tower')!
const counter = document.querySelector<HTMLParagraphElement>('#counter')!
const addButton = document.querySelector<HTMLButtonElement>('#add-floor')!
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!

let floors = 0

function updateCounter() {
  counter.textContent = floors === 1 ? '1 floor' : `${floors} floors`
}

addButton.addEventListener('click', () => {
  floors += 1
  const floor = document.createElement('div')
  floor.className = 'floor'
  // Every floor gets its own pastel color.
  floor.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 80%)`
  tower.prepend(floor)
  updateCounter()
})

resetButton.addEventListener('click', () => {
  floors = 0
  tower.innerHTML = ''
  updateCounter()
})
