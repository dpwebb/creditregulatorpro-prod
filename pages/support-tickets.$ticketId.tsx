import { useParams, useNavigate } from "react-router-dom";
import { SupportTicketDetail } from "../components/SupportTicketDetail";
import { Button } from "../components/Button";
import { ArrowLeft } from "lucide-react";
import styles from "./support-tickets.$ticketId.module.css";

export default function SupportTicketDetailPage() {
  const { ticketId } = useParams();
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <div className={styles.backNav}>
        <Button variant="ghost" onClick={() => navigate("/support-tickets")} className={styles.backButton}>
          <ArrowLeft size={16} /> Back to Tickets
        </Button>
      </div>
      {ticketId && <SupportTicketDetail ticketId={Number(ticketId)} />}
    </div>
  );
}