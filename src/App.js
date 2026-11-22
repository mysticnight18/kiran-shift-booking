import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Platform, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createShiftApi } from './api.mjs';
import { addDays, cities, dayStart, getBookingBlock, groupByDate, overlaps, shiftTimeRange, weekStart } from './shifts.mjs';

const localHost = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
const defaultApiUrl = Platform.OS === 'web' ? '' : `http://${localHost}:8080`;
const api = createShiftApi(process.env.EXPO_PUBLIC_API_URL || defaultApiUrl);

const colors = {
  ink: '#26342D', muted: '#57645B', green: '#234B39', soft: '#E6EEE4',
  paper: '#F7F6F0', white: '#FFFEF9', line: '#E4E5DC',
  rose: '#88423E', roseLine: '#E8D6D3', palePink: '#FCEFEB',
  amber: '#80501B', paleAmber: '#F8EDDC', quiet: '#EFF0EB',
};

const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const headingFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

function CalendarMark() {
  return (
    <View accessible={false} style={styles.mark}>
      <View style={styles.calendarOutline}><View style={styles.calendarLine} /></View>
    </View>
  );
}

function durationLabel(shifts) {
  const total = Math.round(shifts.reduce((minutes, shift) => minutes + (shift.endTime - shift.startTime) / 60000, 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return [hours ? `${hours} h` : '', minutes ? `${minutes} min` : ''].filter(Boolean).join(' ') || '0 min';
}

function dailySummary(shifts) {
  return `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'} · ${durationLabel(shifts)}`;
}

function ShiftRow({ shift, bookedOnly, pending, busy, booked, now, onUpdate }) {
  const started = shift.startTime <= now;
  const block = shift.booked && started ? 'Started' : getBookingBlock(shift, booked, now);
  const isPending = pending === shift.id;
  const action = shift.booked ? 'Cancel' : 'Book';
  const conflict = block === 'Overlaps' && booked.find(other => overlaps(shift, other));
  const status = conflict ? 'Time conflict' : block || (shift.booked ? 'Booked' : 'Open');
  const statusStyle = block ? styles.conflict : shift.booked ? styles.confirmed : styles.open;
  const note = conflict ? `Overlaps ${shiftTimeRange(conflict)} in ${conflict.area}` : durationLabel([shift]);
  const tone = shift.booked ? styles.cancelButton : styles.bookButton;
  const actionColor = shift.booked ? colors.rose : colors.white;
  const disabled = Boolean(block || busy);

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.time}>{shiftTimeRange(shift)}</Text>
        <View style={styles.rowDetails}>
          <Text style={[styles.status, statusStyle]}>{status}</Text>
          {bookedOnly && <Text style={styles.rowMeta}>{shift.area}</Text>}
          <Text style={styles.rowMeta}>{note}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action} shift in ${shift.area}, ${shiftTimeRange(shift)}`}
        accessibilityState={{ disabled, busy: isPending }}
        disabled={disabled}
        style={({ pressed }) => [styles.action, tone, disabled && !isPending && styles.disabled, pressed && styles.pressed]}
        onPress={() => onUpdate(shift, action.toLowerCase())}
      >
        {isPending
          ? <ActivityIndicator color={actionColor} />
          : <Text style={[styles.actionLabel, { color: disabled && !isPending ? colors.muted : actionColor }]}>{action}</Text>}
      </Pressable>
    </View>
  );
}

function ShiftBooking() {
  const [tab, setTab] = useState('Available shifts');
  const [city, setCity] = useState(cities[0]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef(false);
  const bookedOnly = tab === 'My shifts';
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setNotice(null);
    setNow(Date.now());
    try {
      setShifts(await api.list());
      setLoaded(true);
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => setNow(Date.now()), 15000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [refresh]);

  async function updateShift(shift, action) {
    const timestamp = Date.now();
    setNow(timestamp);
    if (inFlight.current || shift.startTime <= timestamp || getBookingBlock(shift, booked, timestamp)) return;

    inFlight.current = true;
    setPending(shift.id);
    setNotice(null);
    try {
      const updated = await api.update(shift.id, action);
      setShifts(current => current.map(item => item.id === updated.id ? updated : item));
      setNotice({ text: action === 'book' ? 'Shift booked.' : 'Shift cancelled.' });
    } catch (error) {
      setNotice({ text: error.message, error: true });
      // Reconcile after an uncertain response or a booking made elsewhere.
      try {
        setShifts(await api.list());
      } catch {
        setNotice({ text: `${error.message} Refresh when connected.`, error: true });
      }
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  const booked = shifts.filter(shift => shift.booked).sort((a, b) => a.startTime - b.startTime);
  const upcoming = shifts.filter(shift => shift.startTime > now).sort((a, b) => a.startTime - b.startTime);
  const cityShifts = upcoming.filter(shift => shift.area === city);
  const firstWeek = weekStart(now);
  const lastWeek = upcoming.length ? weekStart(upcoming[upcoming.length - 1].startTime) : firstWeek;
  const day = selectedDay ?? dayStart(cityShifts[0]?.startTime ?? now);
  const week = weekStart(day);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const dayShifts = cityShifts.filter(shift => dayStart(shift.startTime) === day);
  const openCount = dayShifts.filter(shift => !shift.booked && !getBookingBlock(shift, booked, now)).length;
  const nextShift = booked.find(shift => shift.startTime > now);

  function selectCity(area) {
    setCity(area);
    // Keep the date while comparing cities.
    setSelectedDay(day);
  }

  const shiftRow = item => (
    <ShiftRow key={item.id} shift={item} bookedOnly={bookedOnly} booked={booked} now={now}
      pending={pending} busy={loading || pending !== null} onUpdate={updateShift} />
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.layout}>
          <View style={styles.top}>
            <View style={styles.brandRow}><CalendarMark /><Text style={styles.brand}>Shift Booking</Text></View>
            <View style={styles.navigation}>
              {['Available shifts', 'My shifts'].map(label => (
                <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label}
                  accessibilityState={{ selected: label === tab }} onPress={() => setTab(label)}
                  style={[styles.navItem, label === tab && styles.selected]}>
                  <Text style={[styles.navText, label === tab && styles.selectedText]}>
                    {label}{label === 'My shifts' && booked.length ? `  ${booked.length}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text accessibilityRole="header" style={[styles.title, wide && styles.wideTitle]}>{tab}</Text>
              <Text style={styles.subtitle}>{bookedOnly ? 'Your booked shifts by date' : 'Choose a city and day'}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={refresh} disabled={loading || pending !== null} style={styles.refresh}>
              <Text style={styles.link}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
            </Pressable>
          </View>

          {notice && (
            <View style={[styles.notice, notice.error && styles.errorNotice]}>
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
                style={[styles.noticeText, notice.error && styles.errorText]}>{notice.text}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setNotice(null)}
                style={styles.dismiss}><Text style={styles.dismissText}>×</Text></Pressable>
            </View>
          )}

          <View style={[styles.grid, wide && styles.gridWide]}>
            <View style={[styles.panel, styles.mainPanel]}>
              {!bookedOnly && (
                <>
                  <View style={styles.filters}>
                    {cities.map(area => (
                      <Pressable key={area} accessibilityRole="button" accessibilityState={{ selected: city === area }}
                        onPress={() => selectCity(area)} style={[styles.filter, city === area && styles.selected]}>
                        <Text style={[styles.filterText, city === area && styles.selectedText]}>
                          {area}{loaded ? ` (${upcoming.filter(shift => shift.area === area).length})` : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.calendar}>
                    <View style={styles.weekHeading}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Previous week" disabled={week <= firstWeek}
                        style={[styles.weekArrow, week <= firstWeek && styles.faded]} onPress={() => setSelectedDay(addDays(day, -7))}>
                        <Text style={styles.arrow}>‹</Text>
                      </Pressable>
                      <Text style={styles.weekLabel}>{shortDate.format(week)} – {shortDate.format(weekDays[6])}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="Next week" disabled={week >= lastWeek}
                        style={[styles.weekArrow, week >= lastWeek && styles.faded]} onPress={() => setSelectedDay(addDays(day, 7))}>
                        <Text style={styles.arrow}>›</Text>
                      </Pressable>
                    </View>
                    <View style={styles.week}>
                      {weekDays.map(date => {
                        const selected = date === day;
                        const hasShifts = cityShifts.some(shift => dayStart(shift.startTime) === date);
                        return (
                          <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected }}
                            accessibilityLabel={`${dayLabel.format(date)}${hasShifts ? ', shifts listed' : ''}`}
                            style={[styles.day, selected && styles.daySelected]} onPress={() => setSelectedDay(date)}>
                            <Text style={[styles.dayName, selected && styles.daySelectedText]}>{shortDay.format(date)}</Text>
                            <Text style={[styles.dayNumber, selected && styles.daySelectedText]}>{new Date(date).getDate()}</Text>
                            <View style={[styles.dot, !hasShifts && styles.hiddenDot, selected && styles.selectedDot]} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              <View style={styles.list}>
                {loading && !loaded ? <ActivityIndicator size="large" color={colors.green} /> : !loaded ? (
                  <View style={styles.empty}>
                    <Text style={styles.sectionTitle}>Shifts unavailable</Text>
                    <Pressable style={styles.emptyAction} accessibilityRole="button" onPress={refresh}>
                      <Text style={styles.link}>Try again</Text>
                    </Pressable>
                  </View>
                ) : bookedOnly ? (
                  booked.length ? groupByDate(booked).map(section => (
                    <View key={section.title} style={styles.section}>
                      <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
                      <Text style={styles.sectionMeta}>{dailySummary(section.data)}</Text>
                      {section.data.map(shiftRow)}
                    </View>
                  )) : (
                    <View style={styles.empty}>
                      <Text style={styles.sectionTitle}>No booked shifts</Text>
                      <Pressable style={styles.emptyAction} accessibilityRole="button" onPress={() => setTab('Available shifts')}>
                        <Text style={styles.link}>Browse available shifts</Text>
                      </Pressable>
                    </View>
                  )
                ) : (
                  <View>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>{dayLabel.format(day)}</Text>
                    <Text style={styles.sectionMeta}>{openCount} open to book</Text>
                    {dayShifts.length ? dayShifts.map(shiftRow) : <Text style={styles.emptyText}>No shifts in {city} on this day.</Text>}
                  </View>
                )}
              </View>
            </View>

            {loaded && (
              <View style={[styles.panel, styles.aside, wide && styles.asideWide]}>
                <Text accessibilityRole="header" style={styles.asideHeading}>Next booked shift</Text>
                {nextShift ? (
                  <View style={styles.next}>
                    <Text style={styles.nextCity}>{nextShift.area}</Text>
                    <Text style={styles.rowMeta}>{dayLabel.format(nextShift.startTime)}</Text>
                    <Text style={styles.rowMeta}>{shiftTimeRange(nextShift)}</Text>
                  </View>
                ) : <Text style={styles.emptyText}>No upcoming bookings.</Text>}
                <View style={styles.totals}>
                  <View><Text style={styles.total}>{booked.length}</Text><Text style={styles.rowMeta}>Booked shifts</Text></View>
                  <View><Text style={styles.total}>{durationLabel(booked)}</Text><Text style={styles.rowMeta}>Total booked time</Text></View>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><ShiftBooking /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 28 },
  layout: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 15 },
  top: { minHeight: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 5, paddingVertical: 7, borderBottomWidth: 1, borderColor: colors.line },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brand: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  mark: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.green,
    alignItems: 'center', justifyContent: 'center' },
  calendarOutline: { width: 17, height: 16, borderWidth: 1.5, borderColor: colors.white, borderRadius: 3 },
  calendarLine: { marginTop: 4, borderTopWidth: 1.5, borderColor: colors.white },
  navigation: { flexDirection: 'row', gap: 3 },
  navItem: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', borderRadius: 8 },
  navText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  selected: { backgroundColor: colors.soft },
  selectedText: { color: colors.green, fontWeight: '800' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 24, paddingBottom: 19 },
  headingCopy: { flex: 1 },
  title: { color: colors.ink, fontFamily: headingFont, fontSize: 35, letterSpacing: -1.5 },
  wideTitle: { fontSize: 54, letterSpacing: -2.4 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 5 },
  refresh: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 },
  link: { color: colors.green, fontWeight: '800' },
  grid: { gap: 14 },
  gridWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 22 },
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.white },
  mainPanel: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8, borderBottomWidth: 1, borderColor: colors.line },
  filter: { minHeight: 44, paddingHorizontal: 9, borderRadius: 8, justifyContent: 'center' },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  calendar: { padding: 8, borderBottomWidth: 1, borderColor: colors.line },
  weekHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  weekArrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: colors.green, fontSize: 25 },
  faded: { opacity: 0.35 },
  weekLabel: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  week: { flexDirection: 'row', gap: 3 },
  day: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 7, minHeight: 63,
    borderRadius: 9, borderWidth: 1, borderColor: colors.line },
  daySelected: { backgroundColor: colors.green, borderColor: colors.green },
  dayName: { color: colors.muted, fontSize: 11 },
  dayNumber: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  daySelectedText: { color: colors.white },
  dot: { width: 5, height: 5, backgroundColor: '#658F6F', borderRadius: 3 },
  hiddenDot: { opacity: 0 },
  selectedDot: { backgroundColor: '#C9E6BC' },
  list: { padding: 16 },
  section: { marginBottom: 12 },
  sectionTitle: { fontFamily: headingFont, fontSize: 24, color: colors.ink },
  sectionMeta: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: colors.line,
    minHeight: 76, paddingVertical: 11 },
  rowInfo: { flex: 1, minWidth: 0, gap: 4 },
  rowDetails: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  time: { color: colors.ink, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rowMeta: { color: colors.muted, fontSize: 12 },
  status: { overflow: 'hidden', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, fontWeight: '700', fontSize: 12 },
  open: { color: colors.ink, backgroundColor: colors.quiet },
  confirmed: { color: colors.green, backgroundColor: colors.soft },
  conflict: { color: colors.amber, backgroundColor: colors.paleAmber },
  action: { minHeight: 44, minWidth: 76, borderRadius: 8, borderWidth: 1, borderColor: 'transparent',
    paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontWeight: '800', fontSize: 14 },
  bookButton: { backgroundColor: colors.green },
  cancelButton: { borderColor: colors.roseLine },
  disabled: { backgroundColor: colors.quiet },
  pressed: { opacity: 0.65 },
  aside: { padding: 16 },
  asideWide: { width: 265 },
  asideHeading: { fontFamily: headingFont, fontSize: 23, color: colors.ink },
  next: { marginTop: 13, padding: 13, backgroundColor: colors.soft, borderRadius: 10, gap: 2 },
  nextCity: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  totals: { flexDirection: 'row', gap: 18, marginTop: 14 },
  total: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  empty: { gap: 12, paddingVertical: 14 },
  emptyText: { color: colors.muted, paddingVertical: 12 },
  emptyAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  notice: { marginBottom: 12, paddingLeft: 13, backgroundColor: colors.soft, borderRadius: 9, flexDirection: 'row', alignItems: 'center' },
  noticeText: { flex: 1, color: colors.green, paddingVertical: 8 },
  errorNotice: { backgroundColor: colors.palePink },
  errorText: { color: colors.rose },
  dismiss: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dismissText: { color: colors.ink, fontSize: 22 },
});
