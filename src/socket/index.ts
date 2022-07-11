import { Server } from 'socket.io';
import { texts } from '../data';
import * as config from './config';

const users: string[] = [];
const rooms: Array<{ name: string, users: Array<{ name: string, id: string, status: boolean, percentOfTextDone: number, userTime: number }> }> = [];
const getUpdatedRoom = (name: string, user?: string, id?: string) => {
	const roomIndex = rooms.findIndex((room) => room.name === name);
	if (user) rooms[roomIndex].users.push({ name: user, id: id!, status: false, percentOfTextDone: 0, userTime: 60 });
	return rooms[roomIndex];
}

export default (io: Server) => {
	io.on('connection', socket => {
		const username = socket.handshake.query.username;

		socket.on('VALIDATE_USERNAME', (username) => {
			const isExistingUser = users.find(user => {
				return user === username;
			})
			if (isExistingUser) {
				socket.emit('USER_ALREADY_EXISTS', username);
			}	else {
				socket.emit('USER_CREATED');
				users.push(username as string);
			}
		})

		rooms.forEach(room => {
			const index = room.users.findIndex(user => user.name === username as string);
			if (index !== -1) room.users.splice(index, 1);
		})

		const index = rooms.findIndex(room => !room.users.length);
		if (index !== -1) rooms.splice(index, 1);

		io.emit('UPDATE_ROOMS', rooms);


		socket.on('CREATE_ROOM', (roomname) => {
			const sameNameCheck = rooms.find(room => room.name === roomname);
			if (sameNameCheck) {
				socket.emit('UNAVAILABLE_ROOMNAME')
			} else {
				rooms.push({ name: roomname, users: [] });
				socket.emit('CREATED_ROOM', roomname);
			}
		})

		socket.on('JOIN_ROOM', ({ roomname, isOwner }) => {
			const updatedRoom = getUpdatedRoom(roomname, username as string, socket.id)
			if (isOwner) {
				io.emit('SHOW_ROOM', rooms.find(room => {
					return room.name === roomname;
				}));
			}
			rooms.forEach(room => {
				if (room.name === roomname) {
					room.users.forEach(user => {
						io.to(user.id).emit('UPDATE_ROOM', { name: updatedRoom.name, users: updatedRoom.users })
					})
				}
			})
			if (updatedRoom.users.length === config.MAXIMUM_USERS_FOR_ONE_ROOM) io.emit('HIDE_ROOM', roomname);
			io.emit('UPDATE_CONNECTED', { name: updatedRoom.name, users: updatedRoom.users });
		})

		socket.on('READY_STATUS', ({ status, username, roomname }) => {
			const roomIndex = rooms.findIndex(room => room.name === roomname);
			const userIndex = rooms[roomIndex].users.findIndex(user => user.name === username);
			rooms[roomIndex].users[userIndex].status = status;
			const notReady = rooms[roomIndex].users.find(user => !user.status );
			if (!notReady) {
				rooms.forEach(room => {
					if (room.name === roomname) {
						room.users.forEach(user => {
							io.to(user.id).emit('START_TIMER', roomname)
						})
					}
				})
				io.emit('HIDE_ROOM', roomname);
			}
			rooms.forEach(room => {
				if (room.name === roomname) {
					room.users.forEach(user => {
						io.to(user.id).emit('UPDATE_ROOM', { name: roomname, users: rooms[roomIndex].users })
					})
				}
			})
		})

		socket.on('GET_TEXT', (roomname) => {
			const randomText = texts[Math.round(Math.random() * 6)]
			rooms.forEach(room => {
				if (room.name === roomname) {
					room.users.forEach(user => {
						io.to(user.id).emit('RECEIVE_TEXT', { randomText, roomname })
					})
				}
			})
		})

		socket.on('FIND_PROGRESS', ({ notReady, entire, roomname }) => {
			const percent = 100 - 100 * notReady / entire;
			rooms.forEach(room => {
				if (room.name === roomname) {
					room.users.forEach(user => {
						io.to(user.id).emit('SET_PROGRESS', { percent, username, roomname })
					})
				}
			})
		})

		socket.on('USER_FINISHED_GAME', ({ percent, username, roomname, timeLefted }) => {
			const roomIndex = rooms.findIndex(room => room.name === roomname);
			const userIndex = rooms[roomIndex].users.findIndex(user => user.name === username);

			rooms[roomIndex].users[userIndex].percentOfTextDone = percent;
			rooms[roomIndex].users[userIndex].userTime = config.SECONDS_FOR_GAME - timeLefted;

			const areAllFinished = rooms[roomIndex].users.find(user => user.percentOfTextDone !== percent)
			if (!areAllFinished) {
				rooms.forEach(room => {
					if (room.name === roomname) {
						room.users.forEach(user => {
							io.to(user.id).emit('GAME_OVER', { users: rooms[roomIndex].users, roomname })
						})
					}
				})
				rooms[roomIndex].users.forEach(user => {
					user.percentOfTextDone = 0;
					user.status = false;
					user.userTime = config.SECONDS_FOR_GAME;
				})
			}
		})

		socket.on('TIME_OVER', ({ notReady, entire, roomname, username }) => {
			const roomIndex = rooms.findIndex(room => room.name === roomname);
			const userIndex = rooms[roomIndex].users.findIndex(user => user.name === username);
			const percent = 100 - 100 * notReady / entire;
			rooms[roomIndex].users[userIndex].percentOfTextDone = percent;
			
			rooms.forEach(room => {
				if (room.name === roomname) {
					room.users.forEach(user => {
						io.to(user.id).emit('GAME_OVER', { users: rooms[roomIndex].users, roomname })
					})
				}
			})
			rooms[roomIndex].users.forEach(user => {
				user.percentOfTextDone = 0;
				user.status = false;
				user.userTime = config.SECONDS_FOR_GAME;
			})
		})

		socket.on('QUIT_ROOM', (roomname) => {
			const roomIndex = rooms.findIndex(room => room.name === roomname);
			const userIndex = rooms[roomIndex].users.findIndex(user => user.name === username);
			rooms[roomIndex].users.splice(userIndex, 1);
			if (!rooms[roomIndex].users.length) {
				rooms.splice(roomIndex, 1);
				io.emit('DELETE_ROOM', roomname);
				return;
			}
			rooms.forEach(room => {
				if (room.name === roomname) {
					room.users.forEach(user => {
						io.to(user.id).emit('UPDATE_ROOM', { name: roomname, users: rooms[roomIndex].users, quitedUser: username })
					})
				}
			})
			const checkForRoomReadiness = rooms[roomIndex].users.find(user => user.status === false);
			if (!checkForRoomReadiness) {
				rooms.forEach(room => {
					if (room.name === roomname) {
						room.users.forEach(user => {
							io.to(user.id).emit('START_TIMER', roomname)
						})
					}
				})
			}
			if (rooms[roomIndex].users.length === config.MAXIMUM_USERS_FOR_ONE_ROOM - 1) io.emit('DISPLAY_ROOM', roomname);
			io.emit('UPDATE_CONNECTED', { name: roomname, users: rooms[roomIndex].users });
		})
	});
};
