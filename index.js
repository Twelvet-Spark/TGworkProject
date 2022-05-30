// Author: Twelvet-Spark
// GitHub: https://github.com/Twelvet-Spark
// Description: Telegram bot about personal data protection.

import TelegramBot from "node-telegram-bot-api";
import config from "config";
import { Ngrok } from "@ngrok/ngrok-api";
import readline from 'readline';
import mysql from "mysql";


// Creating db object
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: config.get('DBpassword'),
  database: 'usersdb'
});

// Connecting to db
db.connect((err) => {
  if(err){
    throw err;
  }
  console.log('MySql connected...')
});

// Setting up input
let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
// Async function used to get user input
async function input(prompt) {
  console.log(prompt);
  let result = (await rl[Symbol.asyncIterator]().next()).value;
  if (result == undefined) {
    console.log('We got undefined input. Changing input to \'n\'.')
    result = 'n'
  };
  return result;
}

// Creating bot object
const TOKEN = config.get('token')
const bot = new TelegramBot(TOKEN, {
    webHook: {
        port: config.get('port')
    }
});

// Setting up Ngrok
const ngrok = new Ngrok({
  apiToken: config.get('ngrok_API_key'),
});
// Search for Ngrok url
// If url not found, await user input and retry or close
// You need to run Ngrok client on your machine to get url
let ngrokUrl = ''
let settingsReady = false;
let listEndpoints
while (settingsReady != true) {
  listEndpoints = await ngrok.endpoints.list()
  if (listEndpoints.length == 0) { // If there is no Ngrok enpoints
    console.log("\nNgrok endpoints not found...\nCheck your Ngrok client or settings")
    // let cycle = 0 // DEBUG PURPOSE: counter
    while (true) {
      // console.log(cycle++) // DEBUG PURPOSE: counter log
      let answer = await input('Retry? (Y/N): ')
      if (answer == 'Y' || answer == 'y') {
        console.log('\n\nRetrying...')
        break
      }
      else if (answer == 'N' || answer == 'n') {
        console.log('\n\nClosing program...')
        process.exit(1)
      }
    }
  }
  else { // If we found Ngrok endpoints, then get "https" full address
    console.log(listEndpoints) // DEBUG PURPOSE: endpoints list log
    for (let step = 0; step <= (listEndpoints.length-1); step++) {
      // DEBUG PURPOSE: Cycle learning
      // console.log('DEBUG ' + (listEndpoints.length-1))
      // console.log('DEBUG ' + step)
      // console.log(listEndpoints[step])
      if (listEndpoints[step].proto == 'https') {
        ngrokUrl = listEndpoints[step].publicUrl
        console.log(`New URL: ${ngrokUrl}`) // DEBUG PURPOSE: Ngrok url log
        break
      }
    }
    settingsReady = true
  }
};
// Setting up webHook for Telegram using full "https" address
bot.setWebHook(`${ngrokUrl}/bot${config.get('token')}`);

// NGROK CONNECTION CHECKER
let waitTime = 10000;
let numberOfTries = 5;
let counter = 1;
async function checkConnection() {
  listEndpoints = await ngrok.endpoints.list()
  if (listEndpoints.length == 0) {
    console.log(`CONNECTION TO NGROK ENDPOINT LOST... (waited for ${(waitTime*counter) / 1000} seconds)`)
    if ((waitTime*counter) >= (waitTime*numberOfTries)) {
      console.log('\n\nReconnection failed, stopping program...')
      process.exit(1)
    }
    else {
      setTimeout(checkConnection, (waitTime*counter))
      counter++
    }
  }
  else if (listEndpoints.length != 0 && counter != 1) {
    for (let step = 0; step <= (listEndpoints.length-1); step++) {
      if (listEndpoints[step].proto == 'https') {
        ngrokUrl = listEndpoints[step].publicUrl
        console.log(`New URL: ${ngrokUrl}`) // DEBUG PURPOSE: Ngrok url log
        break
      }
    }
    bot.setWebHook(`${ngrokUrl}/bot${config.get('token')}`);
    console.log(`Connection restored! (after ${counter} tries)\n\n`)
    counter = 1
    setTimeout(checkConnection, (waitTime))
  }
  else {
    setTimeout(checkConnection, (waitTime))
  }
};
setTimeout(checkConnection, waitTime);

// ------MESSAGES
// Logic for any message get
bot.on('message', msg => {
  console.log(msg) // DEBUG PURPOSE: Update log
  return // DEBUG PURPOSE: Don't use all of that down here
  const { chat: { id, first_name, username }} = msg
  console.log(first_name) // DEBUG PURPOSE: user firstname log
  if (first_name) {
    bot.sendMessage(id, 'Привет ' + first_name)
  }
  else {
    bot.sendMessage(id, 'Приветствую ' + username)
  }
  // DO SOMETHING WITH LARGE STRING
  bot.sendMessage(id, "Здраствуй пользователь, я бот, который поможет тебе сохранить конфиденциальность твоих данных")
});

// Show info about user from Update
bot.onText(/\/myinfo/, msg => {
  const {chat: { id, first_name, username}} = msg
  const {date} = msg 
  let messageText = `Вся ваша информация, что мне известна:\n Имя: ${first_name},\n ID: ${id},\n Никнейм: ${username},\n Дата вашего сообщения (Ой, снова не та дата):\n     ${new Date(date)},\n К сожалению я больше ничего не знаю о вас ;c`
  bot.sendMessage(id, messageText)
});

// Write User to Data Base
bot.onText(/\/write/, msg => {
  const { chat: { id, first_name, last_name }} = msg

  const post = {firstname: first_name, lastname: last_name, chatid: id}
  
  const sql = `
  SELECT ${config.get('DBtableName')}.id AS id,	${config.get('DBtableName')}.firstname AS firstname, ${config.get('DBtableName')}.lastname AS lastname, ${config.get('DBtableName')}.chatid AS chatid, ${config.get('DBtableName')}.phonenumber AS phonenumber, ${config.get('DBtableName')}.insertdate AS insertdate
  FROM ${config.get('DBname')}.${config.get('DBtableName')}
  WHERE chatid=?
  ;`
  db.query(sql, post.chatid, (err, result) => {
    if(err) throw err
    console.log(result) // DEBUG PURPOSE:
    console.log(result.length) // DEBUG PURPOSE:
    if (result.length != 0) {
      console.log(`Yeah, i have ${result.length} records`)
      bot.sendMessage(id, `Вы уже находитесь в базе данных, дата вашего добавления: \n${Date(result[0].insertdate)}`)
    }
    else if (result.length == 0) {
      console.log("Nope, i don't have any records")

      post.insertdate = Date.now()

      db.query(`INSERT INTO ${config.get('DBtableName')} SET ?`, post, (err2, result2) => {
        if(err) throw err2
        console.log(result2) // DEBUG PURPOSE:
        console.log(`USER ${post.firstname} ADDED TO ${config.get('DBname')} DATABASE, ${config.get('DBtableName')} TABLE AND ${result2.insertId} ID`)
        bot.sendMessage(id, "Вы были добавлены в базу данных")
      })
    }
  })
});

// Debug function
bot.onText(/\/del/, msg => {
  const { chat: { id }} = msg
  let sql = `DELETE FROM ${config.get('DBname')}.${config.get('DBtableName')} WHERE ${config.get('DBtableName')}.id BETWEEN 0 AND 10000;`
  db.query(sql, (err, result) => {
    if(err) throw err
    console.log(result) // DEBUG PURPOSE:
    bot.sendMessage(id, `Таблица ${config.get('DBtableName')} в базе данных ${config.get('DBname')} очищено записей: ${result.affectedRows}`)
  })
})

// Query User number
bot.onText(/\/givenumber/, msg => {
  const { chat: { id, first_name, username }} = msg  
  bot.sendMessage(id, 'Share: ', {
    reply_markup: {
      one_time_keyboard: true,
      keyboard: [[{
        text: "Give my phone number",
        request_contact: true,
        request_location: true
      }], ["Cancel"]]
    }
  })
});

// Intro
bot.onText(/\/info/, msg => {
  const {chat: {id, first_name}} = msg
  bot.sendMessage(id, `Привет ${first_name}, я бот созданный на языке JavaScript и я помогу тебе научиться бережно относиться к своим личным данным.`)
});

// Поделить messageText
// Написать начало теории о безопасности личных данных