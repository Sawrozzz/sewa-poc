import { NextResponse } from 'next/server';

export async function GET(
    _: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const response = await fetch(
            `https://dummyjson.com/${slug}`,
            {
                cache: 'no-store',
            }
        );

        if (!response.ok) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Failed to fetch ${slug}`,
                },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}