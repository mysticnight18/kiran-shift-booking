# Shift Booking

A React Native app for browsing and booking work shifts. Available shifts uses a week calendar and city filters for Helsinki, Tampere and Turku. The schedule summary shows your next booking and total booked time. My shifts groups bookings by date, with a daily shift count and duration. Both views use a shared list updated from the server's booking and cancellation responses.

## Run in a browser

From the project folder, run:

```sh
npm install
npm run web
```

Open http://localhost:8080 or forward port **8080** in VS Code's Ports panel and select **Open in Browser**. The build and mock API share one port. Keep the terminal running while you use the link. Stop any earlier API process on port 8080 before starting the browser build.

## Run the native app

Use Node.js 22.13 or later, npm, and an Expo SDK 56 compatible device or emulator.

1. Extract the ZIP and open the `Kiran-Shift-Booking` folder in a terminal. Install the app's dependencies with `npm install`.
2. Start the bundled mock API in one terminal with `npm run api`.
3. In another terminal, run `npm start`. Press `i` for an iOS Simulator or `a` for a standard Android Studio emulator with a running virtual device.

### Run on a phone

Connect the phone and computer to the same network. Start the API with `API_HOST=0.0.0.0 npm run api`. Create a file named `.env` beside `package.json` and set `EXPO_PUBLIC_API_URL=http://192.168.1.10:8080`, replacing the example IP with your computer's LAN IP. Run `npm start`, then scan the QR code with an SDK 56 compatible Expo Go installation. Grant local network access if prompted.

### Use the original assignment server

The bundled Node server implements the supplied [mock API contract](https://github.com/TheAnurag/react-native-assignment/blob/master/api/README.md) and uses the original 34 shift fixtures. It stores bookings in memory and resets them when restarted.

To use the original server instead, run `npm install` and `npm start` in the [assignment repository](https://github.com/TheAnurag/react-native-assignment). The app uses its default port, 8080. For a physical phone, the server needs to listen on the computer's LAN interface and the app needs the LAN URL described above.

## Try the booking flow

1. Choose Helsinki and a date with shifts on the calendar, then book an open shift.
2. Open My shifts to see the new booking and its duration.
3. Look for an overlapping shift in Available shifts. The app blocks it even if it is in a different city. Back-to-back shifts can be booked.
4. Cancel the original booking from either screen. It disappears from My shifts and the overlap restriction clears.
5. Use Refresh in the browser or pull down on either native list to reload shifts from the server.

The app uses the device's local date and time. Available shifts shows upcoming shifts, including upcoming bookings that can still be cancelled. In My shifts, started bookings remain visible and their cancel action is disabled, as specified by the design reference.

Shift fixture data is adapted from the assignment repository, whose package metadata credits Wolt and specifies the MIT license.
