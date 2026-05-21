import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

const Login          = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Register       = lazy(() => import("./pages/Register").then((m) => ({ default: m.Register })));
const Tickets        = lazy(() => import("./pages/Tickets").then((m) => ({ default: m.Tickets })));
const TicketBooking        = lazy(() => import("./pages/TicketBooking").then((m) => ({ default: m.TicketBooking })));
const TicketBookingSuccess = lazy(() => import("./pages/TicketBookingSuccess").then((m) => ({ default: m.TicketBookingSuccess })));
const MyTickets      = lazy(() => import("./pages/MyTickets").then((m) => ({ default: m.MyTickets })));
const Combine        = lazy(() => import("./pages/Combine").then((m) => ({ default: m.Combine })));
const Market         = lazy(() => import("./pages/Market").then((m) => ({ default: m.Market })));
const Community      = lazy(() => import("./pages/Community").then((m) => ({ default: m.Community })));
const Notice         = lazy(() => import("./pages/Notice").then((m) => ({ default: m.Notice })));
const NoticeWrite    = lazy(() => import("./pages/NoticeWrite").then((m) => ({ default: m.NoticeWrite })));
const MyPage         = lazy(() => import("./pages/MyPage").then((m) => ({ default: m.MyPage })));
const Membership     = lazy(() => import("./pages/Membership").then((m) => ({ default: m.Membership })));
const PointHistory   = lazy(() => import("./pages/PointHistory").then((m) => ({ default: m.PointHistory })));
const TicketResale        = lazy(() => import("./pages/TicketResale").then((m) => ({ default: m.TicketResale })));
const TicketResaleSuccess = lazy(() => import("./pages/TicketResaleSuccess").then((m) => ({ default: m.TicketResaleSuccess })));
const MarketBuySuccess    = lazy(() => import("./pages/MarketBuySuccess").then((m) => ({ default: m.MarketBuySuccess })));
const Collection     = lazy(() => import("./pages/Collection").then((m) => ({ default: m.Collection })));
const MemeInfo       = lazy(() => import("./pages/MemeInfo").then((m) => ({ default: m.MemeInfo })));
const Attendance     = lazy(() => import("./pages/Attendance").then((m) => ({ default: m.Attendance })));
const Detail         = lazy(() => import("./pages/Detail").then((m) => ({ default: m.Detail })));
const Exchange       = lazy(() => import("./pages/Exchange").then((m) => ({ default: m.Exchange })));
const EntryScanner   = lazy(() => import("./pages/EntryScanner").then((m) => ({ default: m.EntryScanner })));
const Raffle         = lazy(() => import("./pages/Raffle").then((m) => ({ default: m.Raffle })));

function withSuspense(Component: React.ComponentType) {
  return function LazyRoute() {
    return (
      <Suspense fallback={<div className="page-shell" />}>
        <Component />
      </Suspense>
    );
  };
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: withSuspense(Login),
  },
  {
    path: "/register",
    Component: withSuspense(Register),
  },
  {
    path: "/",
    Component: Layout,
    ErrorBoundary: NotFound,
    children: [
      { index: true, Component: Home },
      { path: "tickets",                  Component: withSuspense(Tickets) },
      { path: "tickets/:eventId/booking", Component: withSuspense(TicketBooking) },
      { path: "tickets/booking/success",  Component: withSuspense(TicketBookingSuccess) },
      { path: "my-tickets",               Component: withSuspense(MyTickets) },
      { path: "combine",                  Component: withSuspense(Combine) },
      { path: "market",                   Component: withSuspense(Market) },
      { path: "community",                Component: withSuspense(Community) },
      { path: "notice",                   Component: withSuspense(Notice) },
      { path: "notice/write",             Component: withSuspense(NoticeWrite) },
      { path: "notice/write/:id",         Component: withSuspense(NoticeWrite) },
      { path: "mypage",                   Component: withSuspense(MyPage) },
      { path: "mypage/membership",        Component: withSuspense(Membership) },
      { path: "mypage/points",            Component: withSuspense(PointHistory) },
      { path: "mypage/raffle",            Component: withSuspense(Raffle) },
      { path: "raffle",                   Component: withSuspense(Raffle) },
      { path: "ticket-resale",            Component: withSuspense(TicketResale) },
      { path: "resale",                   element: <Navigate to="/ticket-resale" replace /> },
      { path: "market/buy/success",          Component: withSuspense(TicketResaleSuccess) },
      { path: "market/fragment/buy/success", Component: withSuspense(MarketBuySuccess) },
      { path: "collection",               Component: withSuspense(Collection) },
      { path: "meme-info",                Component: withSuspense(MemeInfo) },
      { path: "attendance",               Component: withSuspense(Attendance) },
      { path: "detail/:id",               Component: withSuspense(Detail) },
      { path: "exchange",                  Component: withSuspense(Exchange) },
      { path: "entry-scanner",             Component: withSuspense(EntryScanner) },
    ],
  },
  {
    path: "*",
    Component: NotFound,
  },
]);
