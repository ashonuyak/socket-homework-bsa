import { removeClass, addClass } from './helpers/domHelper.mjs'
import { showResultsModal } from './views/modal.mjs'
import {
  appendRoomElement,
  removeRoomElement,
  updateNumberOfUsersInRoom,
} from './views/room.mjs'
import { changeReadyStatus as changeReadySign } from './views/user.mjs'
import { appendUserElement, removeUserElement } from './views/user.mjs'
import { keycodes } from './keycodes.mjs'

const username = sessionStorage.getItem('username')

if (!username) {
  window.location.replace('/login')
}

const socket = io('', { query: { username } })

const addRoomButton = document.getElementById('add-room-btn')
const roomsContainer = document.querySelector('#rooms-wrapper')

const createRoom = () => {
  const roomname = prompt('Input Room Name')
  if (!roomname) return
  socket.emit('CREATE_ROOM', roomname)
}

const updateRooms = (rooms) => {
  roomsContainer.innerHTML = ''
  rooms.forEach(createRoomElement)
}

const createRoomElement = (room) => {
  appendRoomElement({
    name: room.name,
    numberOfUsers: room.users.length,
    onJoin: () => onJoin(room.name),
  })
}

const onJoin = (roomname) => {
  socket.emit('JOIN_ROOM', { roomname, isOwner: false })
  enterRoom(roomname)
  addQuitRoomButton(roomname)
  changeReadyStatus(roomname)
}

const updateRoom = (updatedRoom) => {
  const usersContainer = document.querySelector('#users-wrapper')
  usersContainer.innerHTML = ''

  updatedRoom.users.forEach((user) => {
    appendUserElement({
      username: user.name,
      ready: user.status,
      isCurrentUser: user.name === username,
    })
    if (updatedRoom.quitedUser) removeUserElement(updatedRoom.quitedUser)
  })
}

const updateNumberOfUsers = (updatedRoom) => {
  const roomElement = document.querySelector(
    `.room[data-room-name='${updatedRoom.name}']`
  )
  roomElement.style.display = 'flex'
  if (updatedRoom.numberOfUsers === 5) {
    roomElement.style.display = 'none'
  }
  updateNumberOfUsersInRoom({
    name: updatedRoom.name,
    numberOfUsers: updatedRoom.users.length,
  })
}

const enterRoom = (roomname) => {
  const roomsPage = document.getElementById('rooms-page')
  roomsPage.style.display = 'none'
  const gamePage = document.getElementById('game-page')
  gamePage.style.display = 'flex'
  const roomNameElement = document.getElementById('room-name')
  roomNameElement.innerText = roomname
}

const addQuitRoomButton = (roomname) => {
  const quitRoomButton = document.getElementById('quit-room-btn')
  quitRoomButton.addEventListener('click', () => {
    const readyButton = document.getElementById('ready-btn')
    readyButton.innerText = 'READY'
    readyButton.style.display = 'block'
    const timer = document.getElementById('timer')
    addClass(timer, 'display-none')
    const roomsPage = document.getElementById('rooms-page')
    roomsPage.style.display = 'block'
    const gamePage = document.getElementById('game-page')
    gamePage.style.display = 'none'
    socket.emit('QUIT_ROOM', roomname)
    removeUserElement(username)
  })
}

const changeReadyStatus = (roomname) => {
  const readyButton = document.getElementById('ready-btn')
  readyButton.addEventListener('click', () => {
    const status = readyButton.innerText === 'READY' ? true : false
    changeReadySign({ username, ready: status })
    socket.emit('READY_STATUS', { status, username: username, roomname })
    if (status) return (readyButton.innerText = 'NOT READY')
    readyButton.innerText = 'READY'
  })
}

const startTimer = (roomname) => {
  removeRoomElement(roomname)
  const quitRoomButton = document.getElementById('quit-room-btn')
  quitRoomButton.style.visibility = 'hidden'
  const readyButton = document.getElementById('ready-btn')
  readyButton.style.display = 'none'
  const timer = document.getElementById('timer')
  removeClass(timer, 'display-none')
  let i = 1
  const interval = setInterval(() => {
    timer.innerText = 10 - i
    i++
    if (i === 11) {
      clearInterval(interval)
      addClass(timer, 'display-none')
      socket.emit('GET_TEXT', roomname)
    }
  }, 1000)
}

const receiveText = ({ randomText, roomname }) => {
  const textContainer = document.getElementById('text-container')
  removeClass(textContainer, 'display-none')
  const gameTimer = document.getElementById('game-timer')
  removeClass(gameTimer, 'display-none')
  const gameTimerSeconds = document.getElementById('game-timer-seconds')
  textContainer.innerHTML = randomText.split('').reduce((acc, cur) => {
    return (
      acc +
      `<span id='${
        keycodes.find((key) => key.value === cur).code
      }'>${cur}</span>`
    )
  }, '')
  const letters = document.querySelectorAll('#text-container span')
  const notGreen = Array.from(letters).filter(
    (letter) => letter.class !== 'isGreen'
  )
  document.addEventListener('keypress', (event) => {
    if (event.keyCode.toString() === notGreen[0].id) {
      addClass(notGreen[0], 'isGreen')
      notGreen[0].style.backgroundColor = 'green'
      notGreen[0].style.textDecoration = 'none'
      if (notGreen.length > 1) notGreen[1].style.textDecoration = 'underline'
      notGreen.splice(0, 1)
      socket.emit('FIND_PROGRESS', {
        notReady: notGreen.length,
        entire: letters.length,
        roomname,
      })
    }
  })
  for (let i = 1; i <= 60; i++) {
    (function (index) {
      const gameTimer = setTimeout(() => {
        gameTimerSeconds.innerText = 60 - i
        if (gameTimerSeconds.innerText === '0') {
          socket.emit('TIME_OVER', {
            notReady: notGreen.length,
            entire: letters.length,
            roomname,
            username,
          })
        }
      }, i * 1000)
      socket.on('GAME_OVER', () => clearTimeout(gameTimer))
    })(i)
  }
}

const setProgress = ({ percent, username, roomname }) => {
  const progressBar = document.querySelector(
    `.user-progress[data-username='${username}']`
  )
  progressBar.style.width = `${percent}%`
  if (percent === 100) {
    const gameTimerSeconds = document.getElementById('game-timer-seconds')
    progressBar.style.backgroundColor = 'greenyellow'
    socket.emit('USER_FINISHED_GAME', {
      percent,
      username,
      roomname,
      timeLefted: gameTimerSeconds.innerHTML,
    })
  }
}

const gameOver = ({ users, roomname }) => {
  const usersArray = users.map((user) => {
    return [user.name, user.userTime]
  })
  const usersSortedArray = usersArray.sort((a, b) => {
    if (a[1] > b[1]) {
      return 1
    }
    if (a[1] < b[1]) {
      return -1
    }
    return 0
  })
  showResultsModal({
    usersSortedArray,
    onClose: () => {
      const quitRoomButton = document.getElementById('quit-room-btn')
      quitRoomButton.style.visibility = 'visible'
      const readyButton = document.getElementById('ready-btn')
      readyButton.style.display = 'block'
      readyButton.innerText = 'READY'
      const progressBars = document.querySelectorAll('.user-progress')
      progressBars.forEach((progressBar) => (progressBar.style.width = '0%'))
      usersSortedArray.forEach((user) =>
        changeReadySign({ username: user[0], ready: false })
      )
      const textContainer = document.getElementById('text-container')
      addClass(textContainer, 'display-none')
      const gameTimer = document.getElementById('game-timer')
      addClass(gameTimer, 'display-none')
    },
  })
}

socket.on('UPDATE_ROOMS', updateRooms)
socket.on('UPDATE_CONNECTED', updateNumberOfUsers)
socket.on('SHOW_ROOM', createRoomElement)
socket.on('UNAVAILABLE_ROOMNAME', () => alert('Please enter another room name'))
socket.on('CREATED_ROOM', (roomname) => {
  socket.emit('JOIN_ROOM', { roomname, isOwner: true })
  enterRoom(roomname)
  appendUserElement({ username: username, ready: false, isCurrentUser: true })
  addQuitRoomButton(roomname)
  changeReadyStatus(roomname)
})
socket.on('UPDATE_ROOM', updateRoom)
socket.on('DELETE_ROOM', (roomName) => removeRoomElement(roomName))
socket.on('START_TIMER', startTimer)
socket.on('RECEIVE_TEXT', receiveText)
socket.on('SET_PROGRESS', setProgress)
socket.on('GAME_OVER', gameOver)
socket.on('HIDE_ROOM', (roomname) => {
  const roomElement = document.querySelector(
    `.room[data-room-name='${roomname}']`
  )
  roomElement.style.display = 'none'
})
socket.on('DISPLAY_ROOM', (roomname) => {
  const roomElement = document.querySelector(
    `.room[data-room-name='${roomname}']`
  )
  roomElement.style.display = 'flex'
})
socket.on('DELETE_DISCONNECTED_USER_CARD', (username) => {
	removeUserElement(username)
})

addRoomButton.addEventListener('click', createRoom)
