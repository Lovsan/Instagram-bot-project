var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var InstaAuth = require('./lib/Instagram/accounts/instaAuth')
var ProfileExtractor = require('./lib/Instagram/freindship/profileExtractor')
var FollowEngine = require('./lib/Instagram/freindship/followEngine')
var MediaExtractor = require('./lib/Instagram/media/mediaExtractor')
var path = require('path');
var urlencodedParser = bodyParser.urlencoded({ extended: false });
var app = express();

const bots = [
  {
    id: 'bot-main',
    name: 'Main outreach bot',
    status: 'active',
    proxyId: 'proxy-primary',
    userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
    reportIntervalMinutes: 60,
    monitoring: true,
    autoReporting: true,
    lastReportAt: Date.now(),
    settings: {
      threads: 2,
      notes: 'Primary profile monitor'
    }
  },
  {
    id: 'bot-research',
    name: 'Research helper',
    status: 'idle',
    proxyId: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    reportIntervalMinutes: 45,
    monitoring: true,
    autoReporting: true,
    lastReportAt: Date.now(),
    settings: {
      threads: 1,
      notes: 'Keeps an eye on hashtags'
    }
  }
];

const proxies = [
  {
    id: 'proxy-primary',
    label: 'Primary reverse proxy',
    endpoint: 'http://127.0.0.1:8888',
    reverseTarget: 'https://i.instagram.com',
    isActive: true,
    lastTestResult: 'idle',
    testedAt: null
  },
  {
    id: 'proxy-backup',
    label: 'Backup exit node',
    endpoint: 'socks5://10.0.0.2:1080',
    reverseTarget: 'https://instagram.com',
    isActive: false,
    lastTestResult: 'idle',
    testedAt: null
  }
];

const reportLog = [];
const REPORT_TICK_MS = 60 * 1000;

function sortBots(list) {
  return list
    .slice()
    .sort((a, b) => {
      if (a.status === b.status) {
        return a.name.localeCompare(b.name);
      }
      return a.status === 'active' ? -1 : 1;
    });
}

function pushReport(bot, note, mode) {
  const now = Date.now();
  const entry = {
    botId: bot.id,
    botName: bot.name,
    status: bot.status,
    note: note || 'Auto-report',
    mode: mode || 'auto',
    timestamp: new Date(now).toISOString()
  };
  reportLog.unshift(entry);
  if (reportLog.length > 200) {
    reportLog.pop();
  }
  bot.lastReportAt = now;
}

function findBot(id) {
  return bots.find((bot) => bot.id === id);
}

function findProxy(id) {
  return proxies.find((proxy) => proxy.id === id);
}

function nextId(prefix) {
  return `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
}

sortBots(bots).forEach((bot) => pushReport(bot, 'Boot report', 'bootstrap'));

setInterval(() => {
  const now = Date.now();
  bots.forEach((bot) => {
    if (!bot.monitoring || bot.autoReporting === false) {
      return;
    }
    const interval = Number(bot.reportIntervalMinutes || 60);
    if (Number.isNaN(interval) || interval <= 0) {
      return;
    }
    const elapsed = now - bot.lastReportAt;
    if (elapsed >= interval * REPORT_TICK_MS) {
      pushReport(bot, `Auto report after ${interval}m`, 'auto');
    }
  });
}, REPORT_TICK_MS);


app.set('trust proxy', 1)
InstagramSessions = {}
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

const proxy = require('http-proxy-middleware');
module.exports = function(app) {
  app.use(
    '/api',
    proxy({
      target: 'http://localhost:8089',
      changeOrigin: true,
    })
  );
};

 
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());

app.get('/api/bots', (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const pageSize = parseInt(req.query.pageSize || '10', 10);
  const normalizedPage = Number.isNaN(page) || page < 1 ? 1 : page;
  const normalizedSize = Number.isNaN(pageSize) || pageSize < 1 ? 10 : Math.min(pageSize, 50);
  const sorted = sortBots(bots);
  const start = (normalizedPage - 1) * normalizedSize;
  const items = sorted.slice(start, start + normalizedSize);
  res.json({
    success: true,
    data: {
      items,
      total: bots.length,
      active: bots.filter((bot) => bot.status === 'active').length,
      page: normalizedPage,
      pageSize: normalizedSize
    }
  });
});

app.post('/api/bots', (req, res) => {
  const name = req.body.name;
  if (!name) {
    res.status(400).json({ success: false, message: 'name is required' });
    return;
  }
  const bot = {
    id: nextId('bot'),
    name,
    status: 'idle',
    proxyId: req.body.proxyId || null,
    userAgent: req.body.userAgent || 'Mozilla/5.0',
    reportIntervalMinutes: req.body.reportIntervalMinutes || 60,
    monitoring: true,
    autoReporting: req.body.autoReporting !== false,
    lastReportAt: Date.now(),
    settings: req.body.settings || {}
  };
  bots.push(bot);
  pushReport(bot, 'Bot created', 'manual');
  res.json({ success: true, data: bot });
});

app.patch('/api/bots/:id', (req, res) => {
  const bot = findBot(req.params.id);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Bot not found' });
    return;
  }
  const updatable = ['name', 'status', 'userAgent', 'reportIntervalMinutes', 'monitoring', 'autoReporting'];
  updatable.forEach((key) => {
    if (typeof req.body[key] !== 'undefined') {
      bot[key] = req.body[key];
    }
  });
  if (typeof req.body.settings !== 'undefined') {
    bot.settings = Object.assign({}, bot.settings || {}, req.body.settings);
  }
  if (typeof req.body.proxyId !== 'undefined') {
    bot.proxyId = req.body.proxyId || null;
  }
  res.json({ success: true, data: bot });
});

app.post('/api/bots/:id/deploy', (req, res) => {
  const bot = findBot(req.params.id);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Bot not found' });
    return;
  }
  bot.status = 'active';
  bot.monitoring = true;
  pushReport(bot, 'Deploy requested', 'manual');
  res.json({ success: true, data: bot });
});

app.post('/api/bots/:id/test-settings', (req, res) => {
  const bot = findBot(req.params.id);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Bot not found' });
    return;
  }
  const now = new Date().toISOString();
  bot.settingsTestedAt = now;
  res.json({ success: true, data: { testedAt: now, message: 'Settings validated' } });
});

app.post('/api/bots/:id/useragent/test', (req, res) => {
  const bot = findBot(req.params.id);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Bot not found' });
    return;
  }
  const ua = req.body.userAgent || bot.userAgent;
  const valid = typeof ua === 'string' && ua.length > 10;
  res.json({
    success: true,
    data: { valid, userAgent: ua, message: valid ? 'User agent looks good' : 'User agent is too short' }
  });
});

app.post('/api/bots/:id/report', (req, res) => {
  const bot = findBot(req.params.id);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Bot not found' });
    return;
  }
  pushReport(bot, req.body.note || 'Manual report', 'manual');
  res.json({ success: true, data: reportLog[0] });
});

app.post('/api/bots/:id/monitor', (req, res) => {
  const bot = findBot(req.params.id);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Bot not found' });
    return;
  }
  bot.monitoring = req.body.monitoring !== false;
  res.json({ success: true, data: bot });
});

app.post('/api/bots/:id/proxy', (req, res) => {
  const bot = findBot(req.params.id);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Bot not found' });
    return;
  }
  const proxy = req.body.proxyId ? findProxy(req.body.proxyId) : null;
  bot.proxyId = proxy ? proxy.id : null;
  res.json({ success: true, data: bot });
});

app.get('/api/proxies', (req, res) => {
  res.json({ success: true, data: proxies });
});

app.post('/api/proxies', (req, res) => {
  const proxy = {
    id: nextId('proxy'),
    label: req.body.label || 'New proxy',
    endpoint: req.body.endpoint || '',
    reverseTarget: req.body.reverseTarget || '',
    isActive: req.body.isActive !== false,
    lastTestResult: 'idle',
    testedAt: null
  };
  proxies.push(proxy);
  res.json({ success: true, data: proxy });
});

app.post('/api/proxies/:id/test', (req, res) => {
  const proxy = findProxy(req.params.id);
  if (!proxy) {
    res.status(404).json({ success: false, message: 'Proxy not found' });
    return;
  }
  proxy.lastTestResult = 'ok';
  proxy.testedAt = new Date().toISOString();
  res.json({ success: true, data: proxy });
});

app.get('/api/reports', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const normalizedLimit = Number.isNaN(limit) || limit < 1 ? 50 : Math.min(limit, 200);
  res.json({ success: true, data: reportLog.slice(0, normalizedLimit) });
});

app.get('/localapi', (req, res, next) => {
  data = {
      isLoggedIn: false,
      userdata: {}
  }
  if (req.session.isLoggedIn) {
      data.isLoggedIn = true
      var AuthSession = InstagramSessions[req.sessionID]
      data.userdata = {
          'userid': AuthSession.userid,
          'username': AuthSession.username,
          'fullname': AuthSession.fullname,
          'profile_pic': AuthSession.profile_pic,
          'token' : AuthSession.token,
      }

  }
  res.json(data)



})


app.post('/login', function(request, response) {
  var username = request.body.username;
  var password = request.body.password;
  var AuthSession = new InstaAuth(username, password)
  AuthSession.login((data) => {
    try {
      if (data.success) {
        request.session.isLoggedIn = true
        InstagramSessions[request.sessionID] = AuthSession
        console.log("Logged in successfully")
        userdata = {
            'userid': AuthSession.userid,
            'username': AuthSession.username,
            'fullname': AuthSession.fullname,
            'profile_pic': AuthSession.profile_pic,
            'token' : AuthSession.token
        }
        response.json({
            success: true,
            message: "Logged in successfully",
            userdata: userdata
        })
      } else {
        response.json({
            success: false,
            message: JSON.parse(data.response)
        })
    }
    } catch (e) {
      console.log(e)
      response.json({
                success: false,
                message: "Something went wrong!"
            })	
    }
  })
});


app.get('/logout', (req, res, next) => {
  if (req.session.isLoggedIn) {
      var AuthSession = InstagramSessions[req.sessionID]
      AuthSession.logout((data) => {
          console.log("Logged in successfully")
          req.session.destroy();
          delete InstagramSessions[req.sessionID]
          res.redirect("/")
      })
  } else
      res.redirect("/")
})


app.get('/freindship/followings', (req, res) => {
  var AuthSession = InstagramSessions[req.sessionID]
  var Extracted = new ProfileExtractor()
  if (req.session.isLoggedIn) {
      Extracted.getFollowings(AuthSession.userid,null, (data) => {
        res.json({
          success: true,
          data: JSON.parse(data)
        })
        console.log(data)
      })
  } else {
      res.json({
          success: false
      })
  }
})

app.get('/freindship/followers', (req, res) => {
  var AuthSession = InstagramSessions[req.sessionID]
  var Extracted = new ProfileExtractor()
  if (req.session.isLoggedIn) {
      Extracted.getfollowers(AuthSession.userid,null, (data) => {
        res.json({
          success: true,
          data: JSON.parse(data)
        })
        console.log(data)
      })
  } else {
      res.json({
          success: false
      })
  }
})

app.get('/user/id', (req, res) => {
  var Extracted = new ProfileExtractor()
  if (req.session.isLoggedIn) {
      Extracted.user_to_id('anouarbensaad', (data) => {
        res.json({
          success: true,
          data: data
        })
      })
  } else {
      res.json({
          success: false
      })
  }
})

app.get('/home', function(request, response) {
    if (request.session.loggedin) {
        response.send('Welcome back, ' + request.session.username + '!');
    } else {
        response.send('Please login to view this page!');
    }
    response.end();
});


app.get('/freindship/unfollow', (req, res) => {
  if (req.session.isLoggedIn) {
    var FreindshipEngine = new FollowEngine()
      console.log(req.query)
      //if (typeof(req.query.uid) != 'undefined') {
          var AuthSession = InstagramSessions[req.sessionID]
          FreindshipEngine.unfollow(AuthSession.userid,req.query.uid, (data) => {
              try {
                  data = JSON.parse(data)
                  if (data.status == "ok") {
                      res.json({
                          success: true,
                          data:data
                      })
                  } else
                      res.json({
                          success: false,
                          data:data
                      })

              } catch (e) {
                  console.log(e)
                  res.json({
                      success: false,
                      data:data
                  })
              }
          })
//      }
//  } else {
//      res.json({
//          success: false
//      })

  }
})

app.get('/freindship/follow', (req, res) => {
  if (req.session.isLoggedIn) {
    var FreindshipEngine = new FollowEngine()
    console.log(req.query)
    if (typeof(req.query.uid) != 'undefined') {
        var AuthSession = InstagramSessions[req.sessionID]
        FreindshipEngine.follow(AuthSession.userid,req.query.uid, (data) => {
          try {
              data = JSON.parse(data)
              if (data.status == "ok") {
                  res.json({
                      success: true,
                      data:data
                  })
              } else
                  res.json({
                      success: false,
                      data:data
                  })
                
          } catch (e) {
              console.log(e)
              res.json({
                  success: false,
                  data:data
              })
          }
        })
      }
  }
})

app.get('/media/likers', (req, res) => {
  var medialikers = new MediaExtractor()
  if (req.session.isLoggedIn) {
    medialikers.mediaLikers('https://www.instagram.com/p/B6biiDFCKC3/', (data) => {
        res.json({
          success: true,
          data: JSON.parse(data.response)
        })
      })
  } else {
      res.json({
          success: false
      })
  }
})

app.get('/media/comments', (req, res) => {
  var mediacomments = new MediaExtractor()
  if (req.session.isLoggedIn) {
    mediacomments.mediaComments('https://www.instagram.com/p/B9CgpjEHk-h/',null, (data) => {
        res.json({
          success: true,
          data: JSON.parse(data.response)
        })
      })
  } else {
      res.json({
          success: false
      })
  }
})

app.listen(8089, function () {
  console.log('Example app listening on port 8089!')
})
