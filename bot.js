const TelegramBot = require('node-telegram-bot-api'); // bot API module
const request = require('request');
const fs = require('fs');
const QuickChart = require('quickchart-js');

const token = require('./settings.json').token; // bot token (settings.json)
const db = require('./db.json'),
    db_path = './db.json'; // temp database
const bot = new TelegramBot(token, {polling: true});

bot.onText(/(\/list|\/lst)/, (msg) => {
    const chatID = msg.chat.id;

    updateLatest((data) => {
        let response = 'Available rates\n\n';
        for (let i in data) {
            response += `${i}: ${ data[i].toFixed(2) }\n`
        }

        bot.sendMessage(chatID, response);
    })
});

bot.onText(/\/exchange (.+) to (.+)/, (msg, match) => {
    const chatID = msg.chat.id;
    if (match[2].length > 3) { // when currency name > 3 symb
        return bot.sendMessage(chatID, 'check if the entered currency is correct');
    }
    const params = {
        sum: Number(match[1].replace(/(USD|\$)/, '')),
        to: match[2].toUpperCase()
    }
    updateCurrency((currency) => {
        const result = currency[params.to] ? params.sum * currency[params.to] : 'unknown, we do not know about such a currency';
        bot.sendMessage(chatID, `Result ${params.sum} USD to ${params.to} is ${result.toFixed(2)} ${params.to}`);
    })
})

bot.onText(/\/history (.+)\/(.+)/, (msg, match) => {
    const chatID = msg.chat.id;
    if (match[1].length > 3 || match[1].length > 3) {
        return bot.sendMessage(chatID, 'check if the entered currency is correct');
    }
    const currencies = {
        from: match[1].toUpperCase(),
        to: match[2].toUpperCase()
    }
    const sevenDayAgo = () => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    }
    const dateNow = () => {
        const date = new Date();
        date.setDate(date.getDate());
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    }
    request.get(`https://api.exchangeratesapi.io/history?start_at=${sevenDayAgo()}&end_at=${dateNow()}&base=${currencies.from}&symbols=${currencies.to}`,(e,r,b) => {
        if (e) {
            bot.sendMessage(chatID, 'some error');
            return console.log(e);
        }
        const data = JSON.parse(b);
        const dates = [];
        const currencyHistory = [];
        for (let i in data.rates) {
            currencyHistory.push(data.rates[i][currencies.to]);
            dates.push(i);
        }

        const myChart = new QuickChart();
        myChart.setConfig({
            type: 'line',
            data: { labels: dates, datasets: [{ label: `${currencies.to} to ${currencies.from}`, data: currencyHistory }] },
        });
        myChart.toBinary().then(r => bot.sendPhoto(chatID, r));
    })

})

bot.on("polling_error", console.log);


function updateLatest(callback) {
    if (checkTimeout()) {
        request.get('https://api.exchangeratesapi.io/latest?base=USD', (e,r,b) => {
            if (e) {
                bot.sendMessage(chatID, 'some error');
                return console.log(e);
            }

            db.currency = JSON.parse(b).rates; // update our data
            db.updated = Date.now();
            fs.writeFileSync(db_path, JSON.stringify(db));

            callback(db.currency); // callback new data
        })
    } else {
        callback(db.currency); // callback data from db
    }
}

function updateCurrency(callback) {
    request.get('https://api.exchangeratesapi.io/latest?base=USD', (e,r,b) => {
        if (e) {
            bot.sendMessage(chatID, 'some error');
            return console.log(e);
        }

        db.currency = JSON.parse(b).rates; // update our data
        db.updated = Date.now();
        fs.writeFileSync(db_path, JSON.stringify(db));

        callback(db.currency); // callback new data
    })
}

function checkTimeout() {
    return (Date.now() - 600 <= db.updated);
}
