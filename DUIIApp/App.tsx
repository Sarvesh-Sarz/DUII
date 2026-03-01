import React, {useState, useEffect, useRef} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, StatusBar, Animated, Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, {Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText} from 'react-native-svg';
import {VictoryLine, VictoryBar, VictoryChart, VictoryAxis, VictoryArea, VictoryTheme} from 'victory-native';

const {width: SW} = Dimensions.get('window');
const STORAGE_KEY = 'duii_history_v1';

// Formula
function calcDUII({usage, checks, bedPhone, sleepHours}: any) {
  const U = usage / 11.5;
  const C = (checks - 20) / 130;
  const B = bedPhone / 2.6;
  const BDI = 0.7 * U + 0.29 * C + 0.01 * B;
  const RDI = 0.52 * U + 0.48 * (1 - (sleepHours - 3.8) / 5.8);
  const duii = 0.43 * BDI + 0.57 * RDI;
  return {
    duii: +Math.min(Math.max(duii, 0), 1).toFixed(4),
    BDI: +Math.max(BDI, 0).toFixed(4),
    RDI: +Math.max(RDI, 0).toFixed(4),
  };
}

function getCategory(v: number) {
  if (v < 0.3) return {label: 'Low',      color: '#00c49a', bg: 'rgba(0,196,154,0.15)'};
  if (v < 0.6) return {label: 'Moderate', color: '#f5a623', bg: 'rgba(245,166,35,0.15)'};
  if (v < 0.8) return {label: 'High',     color: '#f15bb5', bg: 'rgba(241,91,181,0.15)'};
  return             {label: 'Severe',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'};
}

// Theme
const DARK = {
  bg: '#060d1a', card: '#0a1628', card2: '#0f1e33',
  border: '#1e3a5f', text: '#e2e8f0', sub: '#94a3b8', muted: '#475569',
};
const LIGHT = {
  bg: '#f0f4ff', card: '#ffffff', card2: '#f1f5fd',
  border: '#d1ddf5', text: '#0f172a', sub: '#475569', muted: '#94a3b8',
};

// Gauge component
function GaugeArc({value, theme}: any) {
  const cat = getCategory(value);
  const r = 80, cx = 120, cy = 100;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (startD: number, endD: number) => {
    const s = toRad(startD - 90), e = toRad(endD - 90);
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const large = endD - startD > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const angle = -135 + value * 270;
  const nx = cx + r * Math.cos(toRad(angle - 90));
  const ny = cy + r * Math.sin(toRad(angle - 90));
  return (
    <Svg width={SW - 40} height={180} viewBox="0 0 240 180">
      <Defs>
        <LinearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%"   stopColor="#00c49a" />
          <Stop offset="40%"  stopColor="#f5a623" />
          <Stop offset="70%"  stopColor="#f15bb5" />
          <Stop offset="100%" stopColor="#ef4444" />
        </LinearGradient>
      </Defs>
      <Path d={arc(-135, 135)} fill="none" stroke={theme.border} strokeWidth="16" />
      <Path d={arc(-135, -135 + value * 270)} fill="none" stroke="url(#gg)" strokeWidth="16" strokeLinecap="round" />
      <Line x1={cx} y1={cy} x2={nx} y2={ny} stroke={theme.text} strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r="6" fill={theme.text} />
      <SvgText x={cx} y={cy + 32} textAnchor="middle" fill={theme.text} fontSize="26" fontWeight="bold">{value.toFixed(3)}</SvgText>
      <SvgText x={cx} y={cy + 52} textAnchor="middle" fill={cat.color} fontSize="13">{cat.label}</SvgText>
      <SvgText x="28"  y="168" fill={theme.muted} fontSize="10">0.0</SvgText>
      <SvgText x="196" y="168" fill={theme.muted} fontSize="10">1.0</SvgText>
    </Svg>
  );
}


// Insights calculations
function computeInsights(history: any[]) {
  if (history.length < 3) return null;

  // Sort oldest first for calculations
  const sorted = [...history].reverse();
  const scores = sorted.map(e => e.duii);
  const n = scores.length;

  // Moving average (3-day)
  const movingAvg = scores.map((_, i) => {
    if (i < 2) return scores[i];
    return +((scores[i] + scores[i-1] + scores[i-2]) / 3).toFixed(4);
  });

  // Linear regression to find trend slope
  const xMean = (n - 1) / 2;
  const yMean = scores.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  scores.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  // 7-day forecast using linear projection
  const forecast = Array.from({length: 7}, (_, i) => {
    const projected = intercept + slope * (n + i);
    return +Math.min(Math.max(projected, 0), 1).toFixed(4);
  });

  // Last 3 days vs previous 3 days comparison
  const recent3 = scores.slice(-3);
  const prev3 = scores.length >= 6 ? scores.slice(-6, -3) : scores.slice(0, 3);
  const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
  const prevAvg = prev3.reduce((a, b) => a + b, 0) / prev3.length;
  const weekChange = +(recentAvg - prevAvg).toFixed(4);

  // Best and worst days
  const best = sorted.reduce((a, b) => a.duii < b.duii ? a : b);
  const worst = sorted.reduce((a, b) => a.duii > b.duii ? a : b);

  // Current trend direction
  const trendDirection = slope > 0.005 ? 'up' : slope < -0.005 ? 'down' : 'stable';

  // Days until critical zone (0.8) at current trend
  let daysToSevere: number | null = null;
  const latestScore = scores[n - 1];
  if (slope > 0 && latestScore < 0.8) {
    daysToSevere = Math.ceil((0.8 - latestScore) / slope);
    if (daysToSevere > 60) daysToSevere = null; // too far, not meaningful
  }

  // Streak: consecutive days above 0.6
  let streak = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i] >= 0.6) streak++;
    else break;
  }

  // Smart alerts
  const alerts: {type: string; msg: string; color: string}[] = [];

  if (trendDirection === 'up' && slope > 0.01) {
    alerts.push({type: 'warning', color: '#f5a623',
      msg: `Your DUII is rising ${(slope * 100).toFixed(1)}% per day. You're heading toward higher intensity.`});
  }
  if (streak >= 3) {
    alerts.push({type: 'danger', color: '#ef4444',
      msg: `${streak} consecutive days above High zone. Consider a digital detox day.`});
  }
  if (daysToSevere !== null && daysToSevere <= 7) {
    alerts.push({type: 'critical', color: '#ef4444',
      msg: `⚠️ At this trend, you may hit Severe zone in ~${daysToSevere} days.`});
  }
  if (trendDirection === 'down' && slope < -0.01) {
    alerts.push({type: 'good', color: '#00c49a',
      msg: `Great progress! Your DUII is dropping ${Math.abs(slope * 100).toFixed(1)}% per day.`});
  }
  if (weekChange > 0.05) {
    alerts.push({type: 'warning', color: '#f5a623',
      msg: `This week's average is ${(weekChange * 100).toFixed(0)}% higher than last week.`});
  }

  // Which variable is hurting most (from most recent entry)
  const latest = sorted[n - 1];
  const varImpact = [
    {label: 'Daily Usage', val: latest.inputs.usage / 11.5, color: '#00c49a'},
    {label: 'Phone Checks', val: (latest.inputs.checks - 20) / 130, color: '#9b5de5'},
    {label: 'Sleep', val: 1 - (latest.inputs.sleepHours - 3.8) / 5.8, color: '#00bbf9'},
    {label: 'Bed Screen', val: latest.inputs.bedPhone / 2.6, color: '#f15bb5'},
  ].sort((a, b) => b.val - a.val);

  return {
    scores, movingAvg, slope, forecast, weekChange,
    trendDirection, daysToSevere, streak,
    best, worst, alerts, varImpact, recentAvg, n,
  };
}

// Insights screen
function InsightsPage({history, theme, darkMode, s}: any) {
  const ins = computeInsights(history);

  if (history.length < 3) {
    return (
      <View style={[s.card, {alignItems: 'center', paddingVertical: 40, marginTop: 10}]}>
        <Text style={{fontSize: 36, marginBottom: 12}}>🔮</Text>
        <Text style={[s.pageTitle, {textAlign: 'center', marginBottom: 8}]}>Not Enough Data Yet</Text>
        <Text style={[s.sub, {textAlign: 'center', lineHeight: 22}]}>
          Save at least <Text style={{color: '#00c49a', fontWeight: 'bold'}}>3 entries</Text> in the Calculator tab to unlock trend prediction and early burnout detection.
        </Text>
        <View style={{marginTop: 20, padding: 14, backgroundColor: darkMode ? '#0f1e33' : '#f1f5fd', borderRadius: 12, width: '100%'}}>
          <Text style={[s.muted, {textAlign: 'center', fontSize: 12}]}>
            You have <Text style={{color: '#00c49a'}}>{history.length}</Text> / 3 entries needed
          </Text>
          <View style={{height: 6, backgroundColor: theme.border, borderRadius: 4, marginTop: 8}}>
            <View style={{height: '100%', width: `${Math.min(history.length / 3 * 100, 100)}%`, backgroundColor: '#00c49a', borderRadius: 4}} />
          </View>
        </View>
      </View>
    );
  }

  const cat = getCategory(ins!.recentAvg);
  const trendIcon = ins!.trendDirection === 'up' ? '📈' : ins!.trendDirection === 'down' ? '📉' : '➡️';
  const trendColor = ins!.trendDirection === 'up' ? '#ef4444' : ins!.trendDirection === 'down' ? '#00c49a' : '#f5a623';
  const trendLabel = ins!.trendDirection === 'up' ? 'Rising' : ins!.trendDirection === 'down' ? 'Improving' : 'Stable';

  return (
    <>
      {/* Header summary */}
      <View style={[s.card, {backgroundColor: darkMode ? '#0f2744' : '#eef4ff', borderColor: trendColor + '44'}]}>
        <Text style={[s.muted, {fontSize: 11, marginBottom: 6}]}>Early Burnout Detection · Based on {ins!.n} entries</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <View>
            <Text style={[s.pageTitle, {fontSize: 22, color: trendColor}]}>{trendIcon} {trendLabel}</Text>
            <Text style={[s.sub, {marginTop: 4}]}>
              Slope: <Text style={{color: trendColor, fontWeight: 'bold'}}>{ins!.slope > 0 ? '+' : ''}{(ins!.slope * 100).toFixed(2)}%/day</Text>
            </Text>
          </View>
          <View style={{alignItems: 'center'}}>
            <Text style={{fontSize: 28, fontWeight: '800', color: cat.color}}>{ins!.recentAvg.toFixed(3)}</Text>
            <Text style={{fontSize: 11, color: cat.color}}>3-day avg</Text>
          </View>
        </View>
        {ins!.daysToSevere !== null && (
          <View style={{marginTop: 12, padding: 10, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, borderWidth: 1, borderColor: '#ef444440'}}>
            <Text style={{fontSize: 12, color: '#ef4444', fontWeight: 'bold'}}>
              ⚠️ Projected to hit Severe zone in ~{ins!.daysToSevere} days
            </Text>
          </View>
        )}
      </View>

      {/* Smart Alerts */}
      {ins!.alerts.length > 0 && (
        <View style={s.card}>
          <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 12}]}>🔔 Smart Alerts</Text>
          {ins!.alerts.map((alert: any, i: number) => (
            <View key={i} style={{
              flexDirection: 'row', gap: 10, padding: 12,
              backgroundColor: alert.color + '15',
              borderRadius: 10, borderLeftWidth: 3,
              borderLeftColor: alert.color, marginBottom: 8,
            }}>
              <Text style={{fontSize: 12, color: alert.color, lineHeight: 20, flex: 1}}>{alert.msg}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Moving Average Chart */}
      <View style={s.card}>
        <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 4}]}>📊 Trend vs Moving Average</Text>
        <Text style={[s.muted, {fontSize: 11, marginBottom: 8}]}>Blue = actual · Teal = 3-day moving average</Text>
        <VictoryChart width={SW - 64} height={180} padding={{top: 10, bottom: 30, left: 40, right: 20}}>
          <VictoryAxis style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 8}}} />
          <VictoryAxis dependentAxis domain={[0, 1]} style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 9}}} />
          <VictoryLine
            data={ins!.scores.map((y: number, x: number) => ({x: x + 1, y}))}
            style={{data: {stroke: '#00bbf9', strokeWidth: 1.5, strokeDasharray: '4,3', opacity: 0.7}}}
          />
          <VictoryLine
            data={ins!.movingAvg.map((y: number, x: number) => ({x: x + 1, y}))}
            style={{data: {stroke: '#00c49a', strokeWidth: 2.5}}}
          />
        </VictoryChart>
        <View style={{flexDirection: 'row', gap: 16, justifyContent: 'center'}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <View style={{width: 16, height: 2, backgroundColor: '#00bbf9'}} />
            <Text style={[s.muted, {fontSize: 10}]}>Actual</Text>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <View style={{width: 16, height: 2.5, backgroundColor: '#00c49a'}} />
            <Text style={[s.muted, {fontSize: 10}]}>3-day MA</Text>
          </View>
        </View>
      </View>

      {/* 7-Day Forecast */}
      <View style={s.card}>
        <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 4}]}>🔮 7-Day Forecast</Text>
        <Text style={[s.muted, {fontSize: 11, marginBottom: 12}]}>Linear projection based on your trend</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          {ins!.forecast.map((val: number, i: number) => {
            const fc = getCategory(val);
            return (
              <View key={i} style={{alignItems: 'center', flex: 1}}>
                <View style={{height: 60, justifyContent: 'flex-end', marginBottom: 4}}>
                  <View style={{
                    width: 10, borderRadius: 4,
                    height: Math.max(val * 60, 4),
                    backgroundColor: fc.color,
                    opacity: 0.5 + i * 0.07,
                  }} />
                </View>
                <Text style={{fontSize: 8, color: fc.color, fontWeight: 'bold'}}>{val.toFixed(2)}</Text>
                <Text style={[s.muted, {fontSize: 8}]}>D+{i + 1}</Text>
              </View>
            );
          })}
        </View>
        <View style={{marginTop: 14, padding: 10, backgroundColor: theme.card2, borderRadius: 10, borderWidth: 1, borderColor: theme.border}}>
          <Text style={[s.sub, {fontSize: 11, textAlign: 'center'}]}>
            Day 7 projection: <Text style={{color: getCategory(ins!.forecast[6]).color, fontWeight: 'bold'}}>{ins!.forecast[6].toFixed(3)}</Text>
            {' '}({getCategory(ins!.forecast[6]).label})
          </Text>
        </View>
      </View>

      {/* Week over week */}
      <View style={s.card}>
        <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 14}]}>📅 Week-over-Week Change</Text>
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={[s.splitCard, {borderTopColor: '#9b5de5', flex: 1}]}>
            <Text style={[s.muted, {fontSize: 10}]}>Previous avg</Text>
            <Text style={{fontSize: 20, fontWeight: '800', color: '#9b5de5', marginTop: 4}}>
              {(ins!.recentAvg - ins!.weekChange).toFixed(3)}
            </Text>
          </View>
          <View style={[s.splitCard, {borderTopColor: ins!.weekChange > 0 ? '#ef4444' : '#00c49a', flex: 1}]}>
            <Text style={[s.muted, {fontSize: 10}]}>Recent avg</Text>
            <Text style={{fontSize: 20, fontWeight: '800', color: ins!.weekChange > 0 ? '#ef4444' : '#00c49a', marginTop: 4}}>
              {ins!.recentAvg.toFixed(3)}
            </Text>
            <Text style={{fontSize: 11, color: ins!.weekChange > 0 ? '#ef4444' : '#00c49a', marginTop: 2}}>
              {ins!.weekChange > 0 ? '▲' : '▼'} {Math.abs(ins!.weekChange * 100).toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Biggest Impact Variable */}
      <View style={s.card}>
        <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 4}]}>🎯 What's Affecting Your Score Most</Text>
        <Text style={[s.muted, {fontSize: 11, marginBottom: 14}]}>Based on your most recent entry</Text>
        {ins!.varImpact.map((item: any, i: number) => (
          <View key={item.label} style={{marginBottom: 14}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6}}>
              <Text style={[s.sub, {fontSize: 12}]}>
                {i === 0 ? '🔴 ' : i === 1 ? '🟡 ' : '🟢 '}{item.label}
              </Text>
              <Text style={{fontSize: 12, color: item.color, fontWeight: 'bold'}}>{(item.val * 100).toFixed(0)}%</Text>
            </View>
            <View style={s.barBg}>
              <View style={[s.barFill, {width: `${Math.min(item.val * 100, 100)}%` as any, backgroundColor: item.color}]} />
            </View>
          </View>
        ))}
        <View style={{padding: 10, backgroundColor: theme.card2, borderRadius: 10, borderWidth: 1, borderColor: theme.border, marginTop: 4}}>
          <Text style={[s.sub, {fontSize: 11}]}>
            💡 Focus on reducing <Text style={{color: ins!.varImpact[0].color, fontWeight: 'bold'}}>{ins!.varImpact[0].label}</Text> for the biggest DUII improvement.
          </Text>
        </View>
      </View>

      {/* Best / Worst days */}
      <View style={s.card}>
        <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 14}]}>🏅 Personal Records</Text>
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={[s.splitCard, {borderTopColor: '#00c49a', flex: 1}]}>
            <Text style={[s.muted, {fontSize: 10}]}>🌟 Best Day</Text>
            <Text style={{fontSize: 22, fontWeight: '800', color: '#00c49a', marginTop: 4}}>{ins!.best.duii}</Text>
            <Text style={[s.muted, {fontSize: 10, marginTop: 2}]}>
              {new Date(ins!.best.timestamp).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}
            </Text>
          </View>
          <View style={[s.splitCard, {borderTopColor: '#ef4444', flex: 1}]}>
            <Text style={[s.muted, {fontSize: 10}]}>⚠️ Worst Day</Text>
            <Text style={{fontSize: 22, fontWeight: '800', color: '#ef4444', marginTop: 4}}>{ins!.worst.duii}</Text>
            <Text style={[s.muted, {fontSize: 10, marginTop: 2}]}>
              {new Date(ins!.worst.timestamp).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}
            </Text>
          </View>
        </View>
        {ins!.streak >= 2 && (
          <View style={{marginTop: 12, padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, borderWidth: 1, borderColor: '#ef444430'}}>
            <Text style={{fontSize: 12, color: '#ef4444'}}>🔥 {ins!.streak}-day streak above High zone (0.6+). Break the cycle!</Text>
          </View>
        )}
      </View>
    </>
  );
}

// Main app
export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [tab, setTab] = useState<'auto'|'manual'>('auto');
  const [activePage, setActivePage] = useState<'calc'|'history'|'insights'|'about'>('calc');
  const [inputs, setInputs] = useState({usage: 6.5, checks: 80, bedPhone: 1.5, sleepHours: 6.5});
  const [history, setHistory] = useState<any[]>([]);
  const [autoFetched, setAutoFetched] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chartTab, setChartTab] = useState<'trend'|'split'|'usage'>('trend');

  const theme = darkMode ? DARK : LIGHT;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) setHistory(JSON.parse(raw));
    });
  }, []);

  const saveHistoryToStorage = (h: any[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  };

  const manualResult = calcDUII(inputs);
  const displayResult = tab === 'auto' ? autoFetched : manualResult;
  const cat = displayResult ? getCategory(displayResult.duii) : null;

  const simulateFetch = () => {
    setLoading(true);
    setAutoFetched(null);
    setTimeout(() => {
      const fetched = {usage: 7.2, checks: 98, bedPhone: 2.1, sleepHours: 5.8};
      setAutoFetched({...calcDUII(fetched), inputs: fetched});
      setLoading(false);
    }, 2000);
  };

  const saveEntry = () => {
    if (!displayResult) return;
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      duii: displayResult.duii,
      BDI: displayResult.BDI,
      RDI: displayResult.RDI,
      inputs: tab === 'auto' ? autoFetched.inputs : {...inputs},
    };
    const updated = [entry, ...history];
    setHistory(updated);
    saveHistoryToStorage(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const deleteEntry = (id: number) => {
    Alert.alert('Delete', 'Remove this entry?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const updated = history.filter(e => e.id !== id);
        setHistory(updated);
        saveHistoryToStorage(updated);
      }},
    ]);
  };

  const clearAll = () => {
    Alert.alert('Clear All', 'Delete all history? This cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Clear', style: 'destructive', onPress: () => {
        setHistory([]);
        saveHistoryToStorage([]);
      }},
    ]);
  };

  const chartData = history.length >= 2
    ? [...history].reverse().slice(-10).map((e, i) => ({
        x: i + 1,
        y: e.duii,
        BDI: e.BDI,
        RDI: e.RDI,
        usage: e.inputs.usage,
        sleep: e.inputs.sleepHours,
        label: new Date(e.timestamp).toLocaleDateString('en-IN', {day:'2-digit', month:'short'}),
      }))
    : null;

  const s = styles(theme);

  // Render
  return (
    <View style={s.root}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.card} />

      
      <View style={s.header}>
        <View>
          <Text style={s.logoText}>DUII</Text>
          <Text style={s.logoSub}>Digital Usage Intensity Index</Text>
        </View>
        <TouchableOpacity onPress={() => setDarkMode(d => !d)} style={s.themeBtn}>
          <Text style={s.themeBtnText}>{darkMode ? '☀️ Light' : '🌙 Dark'}</Text>
        </TouchableOpacity>
      </View>

      
      <View style={s.tabBar}>
        {(['calc','history','insights','about'] as const).map(p => (
          <TouchableOpacity key={p} onPress={() => setActivePage(p)} style={[s.tabItem, activePage === p && s.tabItemActive]}>
            <Text style={[s.tabText, activePage === p && s.tabTextActive]}>
              {p === 'calc' ? 'Calc' : p === 'history' ? 'History' : p === 'insights' ? 'Insights' : 'About'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Calculator */}
        {activePage === 'calc' && (
          <>
            {/* Mode toggle */}
            <View style={s.modeRow}>
              {(['auto','manual'] as const).map(m => (
                <TouchableOpacity key={m} onPress={() => setTab(m)} style={[s.modeBtn, tab === m && s.modeBtnActive]}>
                  <Text style={[s.modeBtnText, tab === m && s.modeBtnTextActive]}>
                    {m === 'auto' ? '📱 Auto Fetch' : '✏️ Manual'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* AUTO FETCH */}
            {tab === 'auto' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, {textAlign: 'center', marginBottom: 8}]}>📲</Text>
                <Text style={[s.sub, {textAlign: 'center', marginBottom: 16, lineHeight: 20}]}>
                  Reads daily usage, phone checks, bed screen time and sleep hours from your device.
                </Text>
                {!autoFetched && !loading && (
                  <TouchableOpacity onPress={simulateFetch} style={s.fetchBtn}>
                    <Text style={s.fetchBtnText}>Fetch from Phone</Text>
                  </TouchableOpacity>
                )}
                {loading && (
                  <Text style={[s.sub, {textAlign: 'center', color: '#00c49a'}]}>🔄 Reading device data...</Text>
                )}
                {autoFetched && (
                  <>
                    <View style={s.grid2}>
                      {[
                        {label: 'Daily Usage',  val: autoFetched.inputs.usage + 'h',       icon: '⏱'},
                        {label: 'Checks',       val: String(autoFetched.inputs.checks),     icon: '👆'},
                        {label: 'Bed Screen',   val: autoFetched.inputs.bedPhone + 'h',    icon: '🌙'},
                        {label: 'Sleep',        val: autoFetched.inputs.sleepHours + 'h',  icon: '😴'},
                      ].map(item => (
                        <View key={item.label} style={s.gridCell}>
                          <Text style={s.muted}>{item.icon} {item.label}</Text>
                          <Text style={[s.cellVal, {color: '#00c49a'}]}>{item.val}</Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity onPress={simulateFetch} style={s.refreshBtn}>
                      <Text style={s.refreshBtnText}>↻ Refresh</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* MANUAL INPUT */}
            {tab === 'manual' && (
              <View style={s.card}>
                <Text style={[s.cardTitle, {color: '#00c49a', marginBottom: 16}]}>Enter Your Values</Text>
                {[
                  {key: 'usage',      label: 'Daily Phone Usage', min: 0,   max: 15,  step: 0.1, unit: 'h', icon: '⏱', color: '#00c49a'},
                  {key: 'checks',     label: 'Phone Checks / Day', min: 20, max: 150, step: 1,   unit: '',  icon: '👆', color: '#9b5de5'},
                  {key: 'bedPhone',   label: 'Screen Before Bed',  min: 0,  max: 4,   step: 0.1, unit: 'h', icon: '🌙', color: '#f15bb5'},
                  {key: 'sleepHours', label: 'Sleep Hours',        min: 3.8, max: 9.6, step: 0.1, unit: 'h', icon: '😴', color: '#00bbf9'},
                ].map(f => (
                  <View key={f.key} style={{marginBottom: 20}}>
                    <View style={s.sliderRow}>
                      <Text style={s.sliderLabel}>{f.icon} {f.label}</Text>
                      <Text style={[s.sliderVal, {color: f.color}]}>{(inputs as any)[f.key]}{f.unit}</Text>
                    </View>
                    <Slider
                      minimumValue={f.min}
                      maximumValue={f.max}
                      step={f.step}
                      value={(inputs as any)[f.key]}
                      onValueChange={v => setInputs(p => ({...p, [f.key]: +v.toFixed(1)}))}
                      minimumTrackTintColor={f.color}
                      maximumTrackTintColor={theme.border}
                      thumbTintColor={f.color}
                    />
                    <View style={s.sliderMinMax}>
                      <Text style={s.muted}>{f.min}{f.unit}</Text>
                      <Text style={s.muted}>{f.max}{f.unit}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* RESULT */}
            {displayResult && (
              <View style={[s.card, {alignItems: 'center'}]}>
                <Text style={s.muted}>Your DUII Score</Text>
                <GaugeArc value={displayResult.duii} theme={theme} />
                <View style={[s.catBadge, {backgroundColor: cat!.bg, borderColor: cat!.color + '60'}]}>
                  <Text style={[s.catBadgeText, {color: cat!.color}]}>
                    {cat!.label} — {cat!.label === 'Low' ? 'Healthy digital usage' : cat!.label === 'Moderate' ? 'Controlled but high exposure' : cat!.label === 'High' ? 'Risk of dependency' : 'Strong digital intensity'}
                  </Text>
                </View>
                <View style={s.bdiRdiRow}>
                  <View style={{alignItems: 'center'}}>
                    <Text style={s.muted}>BDI</Text>
                    <Text style={[s.bigNum, {color: '#9b5de5'}]}>{displayResult.BDI}</Text>
                    <Text style={s.muted}>Behavioral</Text>
                  </View>
                  <View style={s.divider} />
                  <View style={{alignItems: 'center'}}>
                    <Text style={s.muted}>RDI</Text>
                    <Text style={[s.bigNum, {color: '#00bbf9'}]}>{displayResult.RDI}</Text>
                    <Text style={s.muted}>Routine</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={saveEntry} disabled={saved} style={[s.saveBtn, saved && s.saveBtnDone]}>
                  <Text style={[s.saveBtnText, saved && {color: '#00c49a'}]}>
                    {saved ? '✅ Saved to History' : '💾 Save to History'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* FORMULA */}
            {displayResult && (
              <View style={s.card}>
                <Text style={s.muted}>📐 Formula</Text>
                <View style={[s.codeBox, {marginTop: 10}]}>
                  <Text style={s.codeLine}><Text style={{color: '#9b5de5'}}>BDI</Text> = 0.43 × (0.7U + 0.29C + 0.01B)</Text>
                  <Text style={s.codeLine}><Text style={{color: '#00bbf9'}}>RDI</Text> = 0.57 × (0.52U + 0.48(1−S))</Text>
                  <View style={[s.borderTop, {marginTop: 8, paddingTop: 8}]}>
                    <Text style={s.codeLine}>
                      <Text style={{color: '#9b5de5'}}>{(0.43 * displayResult.BDI).toFixed(4)}</Text>
                      <Text style={{color: theme.sub}}> + </Text>
                      <Text style={{color: '#00bbf9'}}>{(0.57 * displayResult.RDI).toFixed(4)}</Text>
                      <Text style={{color: theme.sub}}> = </Text>
                      <Text style={{color: '#00c49a', fontWeight: 'bold'}}>{displayResult.duii}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* SCORE REFERENCE */}
            <View style={s.card}>
              <Text style={[s.muted, {marginBottom: 12}]}>📋 Score Reference</Text>
              {[
                {range: '0.00 – 0.30', label: 'Low',      meaning: 'Healthy digital usage',        color: '#00c49a'},
                {range: '0.30 – 0.60', label: 'Moderate', meaning: 'Controlled but high exposure', color: '#f5a623'},
                {range: '0.60 – 0.80', label: 'High',     meaning: 'Risk of dependency',           color: '#f15bb5'},
                {range: '0.80 – 1.00', label: 'Severe',   meaning: 'Strong digital intensity',     color: '#ef4444'},
              ].map(row => {
                const isYou = displayResult &&
                  displayResult.duii >= parseFloat(row.range.split('–')[0]) &&
                  displayResult.duii < parseFloat(row.range.split('–')[1]);
                return (
                  <View key={row.label} style={[s.refRow, {borderBottomColor: theme.border}]}>
                    <View style={[s.refBar, {backgroundColor: row.color}]} />
                    <View style={{flex: 1}}>
                      <Text style={{fontSize: 11, color: row.color, fontWeight: 'bold'}}>{row.range} — {row.label}</Text>
                      <Text style={[s.muted, {fontSize: 10}]}>{row.meaning}</Text>
                    </View>
                    {isYou && (
                      <View style={[s.youBadge, {borderColor: row.color}]}>
                        <Text style={{fontSize: 10, color: row.color}}>YOU</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* History */}
        {activePage === 'history' && (
          <>
            <View style={s.histHeader}>
              <View>
                <Text style={s.pageTitle}>Your History</Text>
                <Text style={s.muted}>{history.length} saved {history.length === 1 ? 'entry' : 'entries'} · on this device</Text>
              </View>
              {history.length > 0 && (
                <TouchableOpacity onPress={clearAll} style={s.clearBtn}>
                  <Text style={s.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Charts */}
            {chartData && (
              <View style={s.card}>
                <View style={s.chartTabRow}>
                  {(['trend','split','usage'] as const).map(ct => (
                    <TouchableOpacity key={ct} onPress={() => setChartTab(ct)} style={[s.chartTabBtn, chartTab === ct && s.chartTabBtnActive]}>
                      <Text style={[s.chartTabText, chartTab === ct && {color: '#00c49a'}]}>
                        {ct === 'trend' ? 'DUII' : ct === 'split' ? 'BDI/RDI' : 'Usage'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {chartTab === 'trend' && (
                  <VictoryChart width={SW - 64} height={180} theme={VictoryTheme.material} padding={{top: 10, bottom: 30, left: 40, right: 20}}>
                    <VictoryAxis style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 9}}} />
                    <VictoryAxis dependentAxis domain={[0, 1]} style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 9}}} />
                    <VictoryArea data={chartData} x="x" y="y" style={{data: {fill: 'rgba(0,196,154,0.2)', stroke: '#00c49a', strokeWidth: 2}}} />
                  </VictoryChart>
                )}

                {chartTab === 'split' && (
                  <VictoryChart width={SW - 64} height={180} theme={VictoryTheme.material} padding={{top: 10, bottom: 30, left: 40, right: 20}}>
                    <VictoryAxis style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 9}}} />
                    <VictoryAxis dependentAxis domain={[0, 1]} style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 9}}} />
                    <VictoryLine data={chartData} x="x" y="BDI" style={{data: {stroke: '#9b5de5', strokeWidth: 2}}} />
                    <VictoryLine data={chartData} x="x" y="RDI" style={{data: {stroke: '#00bbf9', strokeWidth: 2}}} />
                  </VictoryChart>
                )}

                {chartTab === 'usage' && (
                  <VictoryChart width={SW - 64} height={180} theme={VictoryTheme.material} padding={{top: 10, bottom: 30, left: 40, right: 20}}>
                    <VictoryAxis style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 9}}} />
                    <VictoryAxis dependentAxis style={{axis: {stroke: theme.border}, tickLabels: {fill: theme.muted, fontSize: 9}}} />
                    <VictoryBar data={chartData} x="x" y="usage" style={{data: {fill: '#00bbf9'}}} />
                  </VictoryChart>
                )}
              </View>
            )}

            {/* Empty state */}
            {history.length === 0 && (
              <View style={[s.card, {alignItems: 'center', paddingVertical: 40}]}>
                <Text style={{fontSize: 40, marginBottom: 12}}>📭</Text>
                <Text style={[s.sub, {textAlign: 'center', lineHeight: 22}]}>
                  No history yet. Calculate your score and tap{' '}
                  <Text style={{color: '#00c49a', fontWeight: 'bold'}}>Save to History</Text>
                  {' '}to start tracking.
                </Text>
                <TouchableOpacity onPress={() => setActivePage('calc')} style={[s.fetchBtn, {marginTop: 16}]}>
                  <Text style={s.fetchBtnText}>Go to Calculator →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* History list */}
            {history.map(entry => {
              const ec = getCategory(entry.duii);
              const d = new Date(entry.timestamp);
              return (
                <View key={entry.id} style={[s.histCard, {borderLeftColor: ec.color}]}>
                  <View style={{flex: 1}}>
                    <View style={s.histCardTop}>
                      <Text style={s.muted}>{d.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})} · {d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</Text>
                      <View style={[s.catBadge, {backgroundColor: ec.bg, borderColor: ec.color + '60'}]}>
                        <Text style={[s.catBadgeText, {color: ec.color}]}>{ec.label}</Text>
                      </View>
                    </View>
                    <Text style={[s.bigNum, {color: ec.color, fontSize: 22}]}>{entry.duii}</Text>
                    <View style={s.histMeta}>
                      {[
                        {icon: '⏱', val: entry.inputs.usage + 'h'},
                        {icon: '👆', val: String(entry.inputs.checks)},
                        {icon: '🌙', val: entry.inputs.bedPhone + 'h'},
                        {icon: '😴', val: entry.inputs.sleepHours + 'h'},
                      ].map((m, i) => (
                        <Text key={i} style={[s.muted, {fontSize: 11, marginRight: 10}]}>{m.icon} {m.val}</Text>
                      ))}
                    </View>
                    <View style={{flexDirection: 'row', gap: 16, marginTop: 4}}>
                      <Text style={{fontSize: 10, color: '#9b5de5'}}>BDI {entry.BDI}</Text>
                      <Text style={{fontSize: 10, color: '#00bbf9'}}>RDI {entry.RDI}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => deleteEntry(entry.id)} style={{padding: 6}}>
                    <Text style={{fontSize: 18, color: theme.muted}}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}


        {/* Insights */}
        {activePage === 'insights' && <InsightsPage history={history} theme={theme} darkMode={darkMode} s={s} />}

        {/* About */}
        {activePage === 'about' && (
          <>
            {/* Author */}
            <View style={[s.card, {backgroundColor: darkMode ? '#0f2744' : '#eef4ff', borderColor: '#00c49a44'}]}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>S</Text>
                </View>
                <View>
                  <Text style={[s.pageTitle, {fontSize: 16}]}>M Sarvesh</Text>
                  <Text style={{fontSize: 11, color: '#00c49a', marginTop: 2}}>Creator & Researcher · DUII Formula</Text>
                  <Text style={[s.muted, {fontSize: 10, marginTop: 2}]}>24BDS1109 · Data Science Research, 2026</Text>
                </View>
              </View>
            </View>

            {/* What is DUII */}
            <View style={s.card}>
              <Text style={[s.sub, {lineHeight: 22}]}>
                The <Text style={{color: theme.text, fontWeight: 'bold'}}>Digital Usage Intensity Index (DUII)</Text> is an original composite metric developed by{' '}
                <Text style={{color: theme.text, fontWeight: 'bold'}}>M Sarvesh</Text> to quantify smartphone behavioral intensity. It combines{' '}
                <Text style={{color: '#9b5de5'}}>BDI</Text> and{' '}
                <Text style={{color: '#00bbf9'}}>RDI</Text> — each built from real-world usage data.
              </Text>
            </View>

            {/* Weight chart */}
            <View style={s.card}>
              <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 4}]}>How Each Variable Contributes</Text>
              <Text style={[s.muted, {fontSize: 11, marginBottom: 16}]}>Weight of each factor in the final score</Text>
              {[
                {label: 'Daily Usage (U)',     pct: 52, color: '#00c49a', note: 'Heaviest driver — in both BDI & RDI'},
                {label: 'Phone Checks (C)',    pct: 25, color: '#9b5de5', note: 'High frequency = behavioral dependency'},
                {label: 'Sleep Disruption (S)',pct: 20, color: '#00bbf9', note: 'Less sleep → higher DUII'},
                {label: 'Bed Screen (B)',      pct:  3, color: '#f15bb5', note: 'Bedtime habit signal'},
              ].map(item => (
                <View key={item.label} style={{marginBottom: 16}}>
                  <View style={s.sliderRow}>
                    <Text style={[s.sub, {fontSize: 12}]}>{item.label}</Text>
                    <Text style={{fontSize: 12, color: item.color, fontWeight: 'bold'}}>{item.pct}%</Text>
                  </View>
                  <View style={s.barBg}>
                    <View style={[s.barFill, {width: `${item.pct}%` as any, backgroundColor: item.color}]} />
                  </View>
                  <Text style={[s.muted, {fontSize: 10, marginTop: 3}]}>{item.note}</Text>
                </View>
              ))}
            </View>

            {/* BDI vs RDI split */}
            <View style={s.card}>
              <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 12}]}>Index Split</Text>
              <View style={s.splitBar}>
                <View style={s.splitBDI}><Text style={s.splitText}>BDI 43%</Text></View>
                <View style={s.splitRDI}><Text style={s.splitText}>RDI 57%</Text></View>
              </View>
              <View style={{flexDirection: 'row', gap: 10, marginTop: 12}}>
                <View style={[s.splitCard, {borderTopColor: '#9b5de5'}]}>
                  <Text style={{color: '#9b5de5', fontWeight: 'bold', fontSize: 12, marginBottom: 4}}>BDI</Text>
                  <Text style={[s.sub, {fontSize: 11, lineHeight: 18}]}>Behavioral Dependency — how addicted your usage patterns are</Text>
                </View>
                <View style={[s.splitCard, {borderTopColor: '#00bbf9'}]}>
                  <Text style={{color: '#00bbf9', fontWeight: 'bold', fontSize: 12, marginBottom: 4}}>RDI</Text>
                  <Text style={[s.sub, {fontSize: 11, lineHeight: 18}]}>Routine Disruption — how usage affects sleep & daily life</Text>
                </View>
              </View>
            </View>

            {/* Score ranges */}
            <View style={s.card}>
              <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 14}]}>Score Ranges</Text>
              <View style={s.gradientBar} />
              <View style={s.rangeGrid}>
                {[
                  {range: '0.00–0.30', label: 'Low',      color: '#00c49a', meaning: 'Healthy digital habits'},
                  {range: '0.30–0.60', label: 'Moderate', color: '#f5a623', meaning: 'High but controlled'},
                  {range: '0.60–0.80', label: 'High',     color: '#f15bb5', meaning: 'Risk of dependency'},
                  {range: '0.80–1.00', label: 'Severe',   color: '#ef4444', meaning: 'Strong digital intensity'},
                ].map(row => (
                  <View key={row.label} style={[s.rangeCard, {borderLeftColor: row.color}]}>
                    <Text style={{fontSize: 12, color: row.color, fontWeight: 'bold'}}>{row.label}</Text>
                    <Text style={[s.muted, {fontSize: 10}]}>{row.range}</Text>
                    <Text style={[s.sub, {fontSize: 11}]}>{row.meaning}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Formula */}
            <View style={s.card}>
              <Text style={[s.pageTitle, {fontSize: 14, marginBottom: 12}]}>The Formula</Text>
              <View style={[s.codeBox, {alignItems: 'center', marginBottom: 10}]}>
                <Text style={{fontSize: 14, fontWeight: 'bold', color: '#00c49a', letterSpacing: 0.5}}>DUII = 0.43 × BDI + 0.57 × RDI</Text>
              </View>
              <View style={s.codeBox}>
                <Text style={s.codeLine}><Text style={{color: '#9b5de5'}}>BDI</Text> = 0.70·U + 0.29·C + 0.01·B</Text>
              </View>
              <View style={[s.codeBox, {marginTop: 8}]}>
                <Text style={s.codeLine}><Text style={{color: '#00bbf9'}}>RDI</Text> = 0.52·U + 0.48·(1 − S_norm)</Text>
              </View>
            </View>

            {/* Storage note */}
            <View style={[s.card, {flexDirection: 'row', gap: 12, alignItems: 'flex-start'}]}>
              <Text style={{fontSize: 20}}>🔒</Text>
              <View style={{flex: 1}}>
                <Text style={[s.sub, {lineHeight: 20}]}>
                  All history is stored <Text style={{color: theme.text, fontWeight: 'bold'}}>only on your device</Text>. Nothing is sent to any server.
                </Text>
                <Text style={[s.muted, {fontSize: 11, marginTop: 6}]}>📦 Saved entries: <Text style={{color: '#00c49a'}}>{history.length}</Text></Text>
              </View>
            </View>

            {/* Footer */}
            <View style={{alignItems: 'center', paddingVertical: 28}}>
              <Text style={[s.sub, {fontWeight: 'bold', marginBottom: 4}]}>DUII · Digital Usage Intensity Index</Text>
              <Text style={s.muted}>Developed by <Text style={{color: '#00c49a'}}>M Sarvesh</Text></Text>
              <Text style={[s.muted, {fontSize: 10, marginTop: 4, opacity: 0.6}]}>© 2026 M Sarvesh · All rights reserved</Text>
            </View>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// Styles
const styles = (theme: typeof DARK) => StyleSheet.create({
  root:           {flex: 1, backgroundColor: theme.bg},
  scroll:         {padding: 16, paddingBottom: 40},
  header:         {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border},
  logoText:       {fontSize: 22, fontWeight: '800', color: '#00c49a', letterSpacing: -0.5},
  logoSub:        {fontSize: 9, color: theme.muted, marginTop: 1},
  themeBtn:       {backgroundColor: theme.card2, borderWidth: 1, borderColor: theme.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6},
  themeBtnText:   {fontSize: 12, color: theme.sub},
  tabBar:         {flexDirection: 'row', backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border},
  tabItem:        {flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent'},
  tabItemActive:  {borderBottomColor: '#00c49a'},
  tabText:        {fontSize: 12, color: theme.muted},
  tabTextActive:  {color: '#00c49a', fontWeight: '600'},
  card:           {backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 18, marginBottom: 14},
  cardTitle:      {fontSize: 13, color: theme.text, fontWeight: '600'},
  modeRow:        {flexDirection: 'row', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 3, marginBottom: 14},
  modeBtn:        {flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8},
  modeBtnActive:  {backgroundColor: theme.card2},
  modeBtnText:    {fontSize: 12, color: theme.muted},
  modeBtnTextActive:{color: '#00c49a', fontWeight: '600'},
  fetchBtn:       {backgroundColor: '#00c49a', borderRadius: 10, paddingVertical: 13, alignItems: 'center'},
  fetchBtnText:   {fontSize: 14, fontWeight: '600', color: '#060d1a'},
  refreshBtn:     {borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10},
  refreshBtnText: {fontSize: 12, color: theme.sub},
  grid2:          {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10},
  gridCell:       {flex: 1, minWidth: '45%', backgroundColor: theme.card2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 10},
  cellVal:        {fontSize: 16, fontWeight: 'bold', marginTop: 3},
  sliderRow:      {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
  sliderLabel:    {fontSize: 13, color: theme.sub},
  sliderVal:      {fontSize: 14, fontWeight: 'bold'},
  sliderMinMax:   {flexDirection: 'row', justifyContent: 'space-between', marginTop: 3},
  catBadge:       {borderRadius: 30, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 5, marginTop: 10},
  catBadgeText:   {fontSize: 12, fontWeight: '600'},
  bdiRdiRow:      {flexDirection: 'row', gap: 32, marginVertical: 16, alignItems: 'center'},
  divider:        {width: 1, height: 40, backgroundColor: theme.border},
  bigNum:         {fontSize: 22, fontWeight: '800', marginTop: 2},
  saveBtn:        {width: '100%', backgroundColor: '#00c49a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4},
  saveBtnDone:    {backgroundColor: theme.card2, borderWidth: 1, borderColor: theme.border},
  saveBtnText:    {fontSize: 13, fontWeight: '600', color: '#060d1a'},
  codeBox:        {backgroundColor: theme.card2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12},
  codeLine:       {fontSize: 11, color: theme.sub, lineHeight: 22},
  borderTop:      {borderTopWidth: 1, borderTopColor: theme.border},
  refRow:         {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1},
  refBar:         {width: 4, height: 36, borderRadius: 2},
  youBadge:       {borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2},
  histHeader:     {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14},
  pageTitle:      {fontSize: 16, fontWeight: '800', color: theme.text},
  sub:            {fontSize: 12, color: theme.sub},
  muted:          {fontSize: 11, color: theme.muted},
  clearBtn:       {borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6},
  clearBtnText:   {fontSize: 11, color: theme.muted},
  chartTabRow:    {flexDirection: 'row', gap: 8, marginBottom: 12},
  chartTabBtn:    {borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 5},
  chartTabBtnActive:{borderColor: '#00c49a'},
  chartTabText:   {fontSize: 11, color: theme.muted},
  histCard:       {backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', borderLeftWidth: 4},
  histCardTop:    {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4},
  histMeta:       {flexDirection: 'row', flexWrap: 'wrap', marginTop: 6},
  avatar:         {width: 52, height: 52, borderRadius: 26, backgroundColor: '#00c49a', alignItems: 'center', justifyContent: 'center'},
  avatarText:     {fontSize: 22, fontWeight: 'bold', color: '#060d1a'},
  barBg:          {height: 8, backgroundColor: theme.card2, borderRadius: 6, borderWidth: 1, borderColor: theme.border, overflow: 'hidden'},
  barFill:        {height: '100%', borderRadius: 6},
  splitBar:       {flexDirection: 'row', height: 30, borderRadius: 10, overflow: 'hidden'},
  splitBDI:       {width: '43%', backgroundColor: '#7c3aed', justifyContent: 'center', alignItems: 'center'},
  splitRDI:       {width: '57%', backgroundColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center'},
  splitText:      {fontSize: 11, fontWeight: 'bold', color: 'white'},
  splitCard:      {flex: 1, backgroundColor: theme.card2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, borderTopWidth: 3},
  gradientBar:    {height: 10, borderRadius: 6, marginBottom: 16, backgroundColor: '#00c49a'},
  rangeGrid:      {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  rangeCard:      {width: '47%', backgroundColor: theme.card2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 10, borderLeftWidth: 3, gap: 3},
});
