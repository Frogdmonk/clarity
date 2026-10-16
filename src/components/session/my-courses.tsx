"use client";
import { useQuery } from "@tanstack/react-query";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { fetchMyCourses, keys } from "@/lib/queries";

export function MyCourses() {
  const q = useQuery({ queryKey: keys.myCourses(), queryFn: fetchMyCourses });
  return (
    <div className="space-y-4">
      <PageHeader title="My courses" />
      {q.isLoading ? <p role="status">Loading…</p> : !q.data?.length ? <Empty>You aren&apos;t enrolled in any course yet. Your teacher adds you by UG number.</Empty> : (
        <ul className="space-y-2">
          {q.data.map((c) => (
            <li key={c.course_id}><Card><h2 className="font-medium">{c.courses.title}</h2>
              {c.courses.description && <p className="text-sm text-text-2">{c.courses.description}</p>}</Card></li>
          ))}
        </ul>
      )}
    </div>
  );
}
