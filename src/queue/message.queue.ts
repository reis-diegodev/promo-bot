type MessageJob = {
    image: string | null;
    caption: string;
    groupId: string;
};

const queue: MessageJob[] = [];

export function addToQueue(job: MessageJob) {
    queue.push(job);
}

export function getNextJob(): MessageJob | undefined {
    return queue.shift();
}