import React, { useEffect, useMemo, useState } from 'react';
import './BotManager.css';

const PAGE_SIZE = 5;

function BotManager() {
  const [bots, setBots] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [proxies, setProxies] = useState([]);
  const [selectedBot, setSelectedBot] = useState(null);
  const [reportInterval, setReportInterval] = useState(60);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, botId: null });
  const [message, setMessage] = useState('');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newBot, setNewBot] = useState({
    name: '',
    userAgent: '',
    reportIntervalMinutes: 60,
    proxyId: ''
  });
  const [newProxy, setNewProxy] = useState({
    label: '',
    endpoint: '',
    reverseTarget: ''
  });

  useEffect(() => {
    loadBots(page);
    loadProxies();
    loadReports();
  }, [page]);

  useEffect(() => {
    const hideMenu = () => setContextMenu((menu) => ({ ...menu, visible: false }));
    window.addEventListener('click', hideMenu);
    return () => window.removeEventListener('click', hideMenu);
  }, []);

  const sortedBots = useMemo(() => {
    return bots
      .slice()
      .sort((a, b) => (b.status === 'active') - (a.status === 'active') || a.name.localeCompare(b.name));
  }, [bots]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function loadBots(targetPage) {
    setLoading(true);
    fetch(`/api/bots?page=${targetPage}&pageSize=${PAGE_SIZE}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const items = json.data.items || [];
          setBots(items);
          setTotal(json.data.total || 0);
          setActiveCount(json.data.active || 0);
          const existing = selectedBot ? items.find((b) => b.id === selectedBot.id) : null;
          const nextSelected = existing || items[0] || null;
          setSelectedBot(nextSelected);
          if (nextSelected) {
            setReportInterval(nextSelected.reportIntervalMinutes || 60);
          }
        }
      })
      .finally(() => setLoading(false));
  }

  function loadProxies() {
    fetch('/api/proxies')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setProxies(json.data || []);
        }
      });
  }

  function loadReports() {
    fetch('/api/reports?limit=8')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setReports(json.data || []);
        }
      });
  }

  function handleContextMenu(bot, event) {
    event.preventDefault();
    setSelectedBot(bot);
    setReportInterval(bot.reportIntervalMinutes || 60);
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, botId: bot.id });
  }

  function performAction(bot, action) {
    switch (action) {
      case 'deploy':
        return deployBot(bot.id);
      case 'monitor':
        return toggleMonitoring(bot.id, bot.monitoring === false);
      case 'testSettings':
        return testSettings(bot.id);
      case 'testUserAgent':
        return testUserAgent(bot.id, bot.userAgent);
      case 'manualReport':
        return sendManualReport(bot.id, 'Manual check-in');
      case 'setInterval60':
        return updateInterval(bot.id, 60, true);
      default:
        return null;
    }
  }

  function setStatusMessage(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  }

  function deployBot(id) {
    fetch(`/api/bots/${id}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatusMessage('Bot deployed and activated');
          loadBots(page);
        }
      });
  }

  function testSettings(id) {
    fetch(`/api/bots/${id}/test-settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatusMessage('Settings validated');
        }
      });
  }

  function testUserAgent(id, userAgent) {
    fetch(`/api/bots/${id}/useragent/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAgent })
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatusMessage(json.data.message);
        }
      });
  }

  function sendManualReport(id, note) {
    fetch(`/api/bots/${id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          loadReports();
          setStatusMessage('Report sent home');
        }
      });
  }

  function toggleMonitoring(id, monitoring) {
    fetch(`/api/bots/${id}/monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitoring })
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatusMessage(monitoring ? 'Monitoring enabled' : 'Monitoring paused');
          loadBots(page);
        }
      });
  }

  function updateInterval(id, minutes, autoReporting) {
    const parsed = Number(minutes);
    fetch(`/api/bots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportIntervalMinutes: parsed, autoReporting })
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatusMessage(`Reporting cadence set to ${parsed} minutes`);
          loadBots(page);
        }
      });
  }

  function updateBotSettings(event) {
    event.preventDefault();
    if (!selectedBot) {
      return;
    }
    fetch(`/api/bots/${selectedBot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: selectedBot.name,
        userAgent: selectedBot.userAgent,
        proxyId: selectedBot.proxyId || null,
        reportIntervalMinutes: Number(reportInterval) || 60,
        settings: selectedBot.settings || {}
      })
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatusMessage('Bot settings saved');
          loadBots(page);
        }
      });
  }

  function addBot(event) {
    event.preventDefault();
    const payload = Object.assign({}, newBot, {
      reportIntervalMinutes: Number(newBot.reportIntervalMinutes) || 60
    });
    fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setNewBot({ name: '', userAgent: '', reportIntervalMinutes: 60, proxyId: '' });
          setStatusMessage('Bot added');
          loadBots(page);
        }
      });
  }

  function addProxy(event) {
    event.preventDefault();
    fetch('/api/proxies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProxy)
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setNewProxy({ label: '', endpoint: '', reverseTarget: '' });
          loadProxies();
          setStatusMessage('Proxy saved');
        }
      });
  }

  function assignProxy(botId, proxyId) {
    fetch(`/api/bots/${botId}/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxyId })
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatusMessage('Proxy assigned');
          loadBots(page);
        }
      });
  }

  function testProxy(proxyId) {
    fetch(`/api/proxies/${proxyId}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          loadProxies();
          setStatusMessage('Proxy test completed');
        }
      });
  }

  const selectedProxy = selectedBot ? proxies.find((proxy) => proxy.id === selectedBot.proxyId) : null;

  return (
    <div className="bot-manager">
      <div className="bot-manager__header">
        <div>
          <h2>Bot control center</h2>
          <p className="bot-manager__subtitle">
            Full control with reverse proxy and reporting. Active bots float to the top automatically.
          </p>
        </div>
        <div className="bot-manager__stats">
          <span className="pill">Total bots: {total}</span>
          <span className="pill pill--active">Active: {activeCount}</span>
          <span className="pill">Reports-sendhome-basic: 60m</span>
        </div>
      </div>

      {message && <div className="bot-manager__message">{message}</div>}

      <div className="bot-manager__layout">
        <div className="bot-manager__panel bot-manager__panel--wide">
          <div className="panel-head">
            <div>
              <h3>Bot list</h3>
              <p>Right click a bot row to deploy, test or manage it.</p>
            </div>
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Prev
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>

          <div className="bot-table__wrapper">
            <table className="bot-table">
              <thead>
                <tr>
                  <th>Bot</th>
                  <th>Status</th>
                  <th>Proxy</th>
                  <th>Report every</th>
                  <th>Last report</th>
                  <th>Monitoring</th>
                </tr>
              </thead>
              <tbody>
                {sortedBots.map((bot) => (
                  <tr
                    key={bot.id}
                    className={selectedBot && bot.id === selectedBot.id ? 'active-row' : ''}
                    onClick={() => setSelectedBot(bot)}
                    onContextMenu={(event) => handleContextMenu(bot, event)}
                  >
                    <td>
                      <div className="bot-name">{bot.name}</div>
                      <div className="bot-subtext">UA: {bot.userAgent}</div>
                    </td>
                    <td>
                      <span className={`status status--${bot.status}`}>{bot.status}</span>
                    </td>
                    <td>
                      <select
                        value={bot.proxyId || ''}
                        onChange={(e) => assignProxy(bot.id, e.target.value || null)}
                      >
                        <option value="">No proxy</option>
                        {proxies.map((proxy) => (
                          <option key={proxy.id} value={proxy.id}>
                            {proxy.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{bot.reportIntervalMinutes || 60} m</td>
                    <td>{bot.lastReportAt ? new Date(bot.lastReportAt).toLocaleTimeString() : 'n/a'}</td>
                    <td>{bot.monitoring === false ? 'Paused' : 'Active'}</td>
                  </tr>
                ))}
                {!sortedBots.length && (
                  <tr>
                    <td colSpan="6" className="empty">
                      {loading ? 'Loading bots...' : 'No bots yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bot-manager__panel bot-manager__panel--tight">
          <h3>Selected bot</h3>
          {selectedBot ? (
            <form className="bot-form" onSubmit={updateBotSettings}>
              <label>
                Name
                <input
                  type="text"
                  value={selectedBot.name}
                  onChange={(e) => setSelectedBot({ ...selectedBot, name: e.target.value })}
                />
              </label>
              <label>
                User agent
                <input
                  type="text"
                  value={selectedBot.userAgent}
                  onChange={(e) => setSelectedBot({ ...selectedBot, userAgent: e.target.value })}
                />
              </label>
              <label>
                Reverse proxy
                <select
                  value={selectedBot.proxyId || ''}
                  onChange={(e) => setSelectedBot({ ...selectedBot, proxyId: e.target.value })}
                >
                  <option value="">No proxy</option>
                  {proxies.map((proxy) => (
                    <option key={proxy.id} value={proxy.id}>
                      {proxy.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reports-sendhome cadence (minutes)
                <input
                  type="number"
                  min="1"
                  value={reportInterval}
                  onChange={(e) => setReportInterval(e.target.value)}
                />
              </label>
              <div className="inline-buttons">
                <button type="button" onClick={() => updateInterval(selectedBot.id, reportInterval, true)}>
                  Save cadence
                </button>
                <button type="button" onClick={() => sendManualReport(selectedBot.id, 'Manual status ping')}>
                  Send manual report
                </button>
              </div>
              <div className="inline-buttons">
                <button type="button" onClick={() => testUserAgent(selectedBot.id, selectedBot.userAgent)}>
                  Test user agent
                </button>
                <button type="button" onClick={() => testSettings(selectedBot.id)}>Test settings</button>
              </div>
              <div className="inline-buttons">
                <button type="button" onClick={() => deployBot(selectedBot.id)}>Deploy & activate</button>
                <button type="button" onClick={() => toggleMonitoring(selectedBot.id, selectedBot.monitoring === false)}>
                  {selectedBot.monitoring === false ? 'Resume monitoring' : 'Pause monitoring'}
                </button>
              </div>
              <button type="submit" className="primary">
                Save configuration
              </button>
              {selectedProxy && (
                <div className="proxy-info">
                  <strong>Proxy:</strong> {selectedProxy.label} → {selectedProxy.reverseTarget || 'direct'}
                </div>
              )}
            </form>
          ) : (
            <div className="empty">Pick a bot from the list to manage it.</div>
          )}

          <div className="creator">
            <h4>Add a bot</h4>
            <form onSubmit={addBot} className="bot-form">
              <label>
                Name
                <input
                  type="text"
                  value={newBot.name}
                  onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                />
              </label>
              <label>
                User agent
                <input
                  type="text"
                  value={newBot.userAgent}
                  onChange={(e) => setNewBot({ ...newBot, userAgent: e.target.value })}
                />
              </label>
              <label>
                Reports every (minutes)
                <input
                  type="number"
                  min="1"
                  value={newBot.reportIntervalMinutes}
                  onChange={(e) => setNewBot({ ...newBot, reportIntervalMinutes: e.target.value })}
                />
              </label>
              <label>
                Proxy
                <select
                  value={newBot.proxyId}
                  onChange={(e) => setNewBot({ ...newBot, proxyId: e.target.value })}
                >
                  <option value="">No proxy</option>
                  {proxies.map((proxy) => (
                    <option key={proxy.id} value={proxy.id}>
                      {proxy.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="primary">
                Create bot
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="bot-manager__layout">
        <div className="bot-manager__panel bot-manager__panel--wide">
          <div className="panel-head">
            <div>
              <h3>Proxy manager</h3>
              <p>Reverse proxy system with quick tests and activation.</p>
            </div>
          </div>
          <div className="proxy-grid">
            {proxies.map((proxy) => (
              <div key={proxy.id} className="proxy-card">
                <div className="proxy-card__head">
                  <div>
                    <div className="proxy-title">{proxy.label}</div>
                    <div className="proxy-endpoint">{proxy.endpoint}</div>
                  </div>
                  <span className={proxy.isActive ? 'pill pill--active' : 'pill'}>{proxy.isActive ? 'Active' : 'Idle'}</span>
                </div>
                <div className="proxy-meta">Reverse target: {proxy.reverseTarget || 'Direct'}</div>
                <div className="proxy-meta">
                  Test: {proxy.lastTestResult} {proxy.testedAt ? `@ ${proxy.testedAt}` : ''}
                </div>
                <div className="inline-buttons">
                  <button onClick={() => testProxy(proxy.id)}>Test</button>
                </div>
              </div>
            ))}
            {!proxies.length && <div className="empty">No proxies configured.</div>}
          </div>
          <form className="bot-form proxy-form" onSubmit={addProxy}>
            <h4>Add proxy</h4>
            <label>
              Label
              <input
                type="text"
                value={newProxy.label}
                onChange={(e) => setNewProxy({ ...newProxy, label: e.target.value })}
              />
            </label>
            <label>
              Endpoint / Reverse proxy
              <input
                type="text"
                value={newProxy.endpoint}
                onChange={(e) => setNewProxy({ ...newProxy, endpoint: e.target.value })}
              />
            </label>
            <label>
              Target host (optional)
              <input
                type="text"
                value={newProxy.reverseTarget}
                onChange={(e) => setNewProxy({ ...newProxy, reverseTarget: e.target.value })}
              />
            </label>
            <button type="submit">Save proxy</button>
          </form>
        </div>

        <div className="bot-manager__panel bot-manager__panel--tight">
          <h3>Reports feed</h3>
          <p className="small">Live reports sent home every X minutes or on demand.</p>
          <ul className="report-feed">
            {reports.map((report) => (
              <li key={`${report.botId}-${report.timestamp}`}>
                <div className="report-row">
                  <strong>{report.botName}</strong>
                  <span>{new Date(report.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="report-row">
                  <span className="status-badge">{report.status}</span>
                  <span className="report-note">{report.note}</span>
                  <span className="report-mode">{report.mode}</span>
                </div>
              </li>
            ))}
            {!reports.length && <li className="empty">No reports yet.</li>}
          </ul>
        </div>
      </div>

      {contextMenu.visible && selectedBot && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => performAction(selectedBot, 'deploy')}>Deploy</button>
          <button onClick={() => performAction(selectedBot, 'testSettings')}>Test settings</button>
          <button onClick={() => performAction(selectedBot, 'testUserAgent')}>Test user agent</button>
          <button onClick={() => performAction(selectedBot, 'manualReport')}>Send manual report</button>
          <button onClick={() => performAction(selectedBot, 'monitor')}>
            {selectedBot.monitoring === false ? 'Resume monitoring' : 'Pause monitoring'}
          </button>
          <button onClick={() => performAction(selectedBot, 'setInterval60')}>Reports-sendhome-basic: 60</button>
        </div>
      )}
    </div>
  );
}

export default BotManager;

