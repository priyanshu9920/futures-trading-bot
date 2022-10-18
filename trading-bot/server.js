// Node.js WebSocket server script
const http = require('http');
const WebSocketServer = require('websocket').server;
const fetch = require('node-fetch');

const server = http.createServer();
const port = process.env.PORT || '6999';
server.listen(port);
console.log(`listening on port ${port}`);

const wsServer = new WebSocketServer({
  httpServer: server,
});

wsServer.on('request', function (request) {
  const connection = request.accept(null, request.origin);
  connection.uid = Date.now();
  console.log(`Client with uid ${connection.uid} has connected`);
  clients.set(connection.uid, connection);
  connection.on('message', function (message) {
    console.log('Received Message:', message.utf8Data);
    //connection.sendUTF('Hi this is WebSocket server!');
  });
  connection.on('close', function (reasonCode, description) {
    console.log(`Client with uid ${connection.uid} has disconnected.`);
    clients.delete(connection.uid);
  });
});

var market = new Map();
var clients = new Map();
const url = 'https://fapi.binance.com';

// 5 seconds each candle
const candleLength = 5;

// store 90 minutes data
const maxMinutes = 90;

// (maxMinutes * seconds) / candleLength
const maxCandles = 1080;

var count = 0;
var firstBarsCreation = true;

(async () => {
  fetchTokens();
})();

setInterval(fetchTokens, 5000); // candleLength x 1000 = 5000 ms

async function fetchTokens() {
  try {
    var response = await fetch(`${url}/fapi/v1/ticker/price`);
    var data = await response.json();
    data = clean(data);
    data.forEach((element) => {
      var symbol = element.symbol;
      symbol = symbol.replace('USDT', '');
      var price = parseFloat(element.price);
      if (!market.has(symbol)) {
        market.set(symbol, {
          currentPrice: price,
          lastPrice: price,
          candles: [],
        });
      } else {
        var value = market.get(symbol);
        value.lastPrice = value.currentPrice;
        value.currentPrice = price;
        if (value.candles.length == maxCandles) value.candles.shift();
        var change = value.currentPrice / value.lastPrice - 1;
        change = change.toFixed(4) * 100;
        value.candles.push(change);
      }
    });

    count++;

    if (firstBarsCreation && count % 7 == 0) {
      count = 0;
      firstBarsCreation = false;
      createBars();
    } else if (!firstBarsCreation && count % 6 == 0) {
      count = 0;
      createBars();
    }
  } catch (error) {
    console.log(error);
  }
}

// removes leveraged tokens from the list [*UP, *DOWN, *BULL, *BEAR]
// include only USDT pair
function clean(data) {
  var cleaned_data = [];
  data.forEach((element) => {
    if (
      !element.symbol.includes('UP') &&
      !element.symbol.includes('DOWN') &&
      !element.symbol.includes('BULL') &&
      !element.symbol.includes('BEAR') &&
      element.symbol.slice(-4) == 'USDT'
    ) {
      cleaned_data.push(element);
    }
  });
  return cleaned_data;
}

function createBars() {
  var bars = new Map();
  market.forEach((value, key) => {
    if (!bars.has(key)) bars.set(key, []);

    var candles = value.candles;
    var graph = bars.get(key);

    // analyze  30[seconds]
    graph.push(calculate(candles, 6));

    // analyze  60[seconds]/1[minute]
    graph.push(calculate(candles, 12));

    // analyze  300[seconds]/5[minute]
    graph.push(calculate(candles, 60));

    // analyze  600[seconds]/10[minutes]
    graph.push(calculate(candles, 120));

    // analyze  1800[seconds]/30[minutes]
    graph.push(calculate(candles, 360));

    // analyze  3600[seconds]/60[minutes]
    graph.push(calculate(candles, 720));

    // analyze  5400[seconds]/90[minutes]
    graph.push(calculate(candles, 1080));
  });

  var x = { timestamp: Date.now(), data: [] };

  bars.forEach((value, key) => {
    x.data.push({ symbol: key, bars: value });
  });

  clients.forEach((value) => {
    value.sendUTF(JSON.stringify(x));
  });

  //print(bars); // only for debugging
}

function print(bars) {
  console.log(`COIN\t\t30\t60\t300\t600\t1800\t3600\t5400\t`);
  bars.forEach((value, key) => {
    var str = `${key}\t\t`;
    value.forEach((element) => {
      if (element != null) {
        str += element.average.toFixed(2);
      } else {
        str += 'null';
      }
      str += '\t';
    });
    console.log(str);
  });
  console.log();
}

function calculate(total_candles, length) {
  var positives = 0,
    negatives = 0,
    neutrals = 0,
    average = 0.0;

  var candles = total_candles.slice(Math.max(total_candles.length - length, 0));
  if (candles.length == length) {
    candles.forEach((element) => {
      if (element > 0) positives++;
      else if (element < 0) negatives++;
      else neutrals++;
      average += element;
    });

    return {
      length,
      positives,
      negatives,
      neutrals,
      average,
    };
  }

  return null;
}
