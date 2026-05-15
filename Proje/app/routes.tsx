import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const Register = lazy(() => import("./pages/Register").then((module) => ({ default: module.Register })));
const Tickets = lazy(() => import("./pages/Tickets").then((module) => ({ default: module.Tickets })));
const TicketBooking = lazy(() => import("./pages/TicketBooking").then((module) => ({ default: module.TicketBooking })));
const MyTickets = lazy(() => import("./pages/MyTickets").then((module) => ({ default: module.MyTickets })));
const Combine = lazy(() => import("./pages/Combine").then((module) => ({ default: module.Combine })));
const Market = lazy(() => import("./pages/Market").then((module) => ({ default: module.Market })));
const Community = lazy(() => import("./pages/Community").then((module) => ({ default: module.Community })));
const Notice = lazy(() => import("./pages/Notice").then((module) => ({ default: module.Notice })));
const NoticeWrite = lazy(() => import("./pages/NoticeWrite").then((module) => ({ default: module.NoticeWrite })));
const MyPage = lazy(() => import("./pages/MyPage").then((module) => ({ default: module.MyPage })));
const TicketResale = lazy(() => import("./pages/TicketResale").then((module) => ({ default: module.TicketResale })));
const Collection = lazy(() => import("./pages/Collection").then((module) => ({ default: module.Collection })));
const MemeInfo = lazy(() => import("./pages/MemeInfo").then((module) => ({ default: module.MemeInfo })));
const Attendance = lazy(() => import("./pages/Attendance").then((module) => ({ default: module.Attendance })));
const Detail = lazy(() => import("./pages/Detail").then((module) => ({ default: module.Detail })));

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
      { path: "tickets", Component: withSuspense(Tickets) },
      { path: "tickets/:eventId/booking", Component: withSuspense(TicketBooking) },
      { path: "my-tickets", Component: withSuspense(MyTickets) },
      { path: "combine", Component: withSuspense(Combine) },
      { path: "market", Component: withSuspense(Market) },
      { path: "community", Component: withSuspense(Community) },
      { path: "notice", Component: withSuspense(Notice) },
      { path: "notice/write", Component: withSuspense(NoticeWrite) },
      { path: "notice/write/:id", Component: withSuspense(NoticeWrite) },
      { path: "mypage", Component: withSuspense(MyPage) },
      { path: "ticket-resale", Component: withSuspense(TicketResale) },
      { path: "collection", Component: withSuspense(Collection) },
      { path: "meme-info", Component: withSuspense(MemeInfo) },
      { path: "attendance", Component: withSuspense(Attendance) },
      { path: "detail/:id", Component: withSuspense(Detail) },
    ],
  },
  {
    path: "*",
    Component: NotFound,
  },
]);
