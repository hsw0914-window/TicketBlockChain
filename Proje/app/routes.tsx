import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Combine } from "./pages/Combine";
import { MemeInfo } from "./pages/MemeInfo";
import { Detail } from "./pages/Detail";
import { NotFound } from "./pages/NotFound";
import { Notice } from "./pages/Notice";
import { Collection } from "./pages/Collection";
import { Attendance } from "./pages/Attendance";
import { Tickets } from "./pages/Tickets";
import { MyTickets } from "./pages/MyTickets";
import { Market } from "./pages/Market";
import { Community } from "./pages/Community";
import { MyPage } from "./pages/MyPage";
import { TicketBooking } from "./pages/TicketBooking";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { NoticeWrite } from "./pages/NoticeWrite";
import { TicketResale } from "./pages/TicketResale";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/register",
    Component: Register,
  },
  {
    path: "/",
    Component: Layout,
    ErrorBoundary: NotFound,
    children: [
      { index: true, Component: Home },
      { path: "tickets", Component: Tickets },
      { path: "tickets/:eventId/booking", Component: TicketBooking },
      { path: "my-tickets", Component: MyTickets },
      { path: "combine", Component: Combine },
      { path: "market", Component: Market },
      { path: "community", Component: Community },
      { path: "notice", Component: Notice },
      { path: "notice/write", Component: NoticeWrite },
      { path: "notice/write/:id", Component: NoticeWrite },
      { path: "mypage", Component: MyPage },
      { path: "ticket-resale", Component: TicketResale },
      { path: "collection", Component: Collection },
      { path: "meme-info", Component: MemeInfo },
      { path: "attendance", Component: Attendance },
      { path: "detail/:id", Component: Detail },
    ],
  },
  {
    path: "*",
    Component: NotFound,
  },
]);
