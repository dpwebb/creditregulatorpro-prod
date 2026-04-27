import React, { useState } from "react";
import { SupportTicketList } from "../components/SupportTicketList";
import { CreateTicketDialog } from "../components/CreateTicketDialog";
import { useAuth } from "../helpers/useAuth";
import { Button } from "../components/Button";
import { Plus } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

export default function SupportTicketsPage() {
  const { authState } = useAuth();
  const role = authState.type === 'authenticated' ? authState.user.role : null;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const title = role === 'user' ? "My Support Tickets" : role === 'support' ? "Support Queue" : "All Tickets";

  return (
    <>
      <PageHeader title={title} subtitle="Manage and track your support requests.">
        {role === 'user' && (
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus size={16} /> New Ticket
          </Button>
        )}
      </PageHeader>
      <SupportTicketList />
      <CreateTicketDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}