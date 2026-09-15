import { redirect } from "next/navigation";

export default async function NewsRedirectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/employee/news?id=${encodeURIComponent(id)}`);
}
