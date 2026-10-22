// Deployment store: DynamoDB table, partition key "household" (string), sort key "seq" (number).
// Writes use a condition so an existing seq is never overwritten — the ledger stays append-only.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export class DynamoStore {
  constructor({ table, household = 'demo', region = process.env.AWS_REGION || 'us-east-1' }) {
    this.table = table;
    this.household = household;
    this.doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  async list() {
    const out = [];
    let ExclusiveStartKey;
    do {
      const res = await this.doc.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'household = :h',
        ExpressionAttributeValues: { ':h': this.household },
        ExclusiveStartKey,
      }));
      out.push(...res.Items.map(({ household, ...e }) => e));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  async maxSeq() {
    const res = await this.doc.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: 'household = :h',
      ExpressionAttributeValues: { ':h': this.household },
      ScanIndexForward: false,
      Limit: 1,
    }));
    return res.Items[0]?.seq || 0;
  }

  async append(event) {
    await this.doc.send(new PutCommand({
      TableName: this.table,
      Item: { household: this.household, ...event },
      ConditionExpression: 'attribute_not_exists(seq)',
    }));
  }

  async scrub(id) {
    const target = (await this.list()).find(e => e.id === id);
    if (!target) return;
    await this.doc.send(new UpdateCommand({
      TableName: this.table,
      Key: { household: this.household, seq: target.seq },
      UpdateExpression: 'SET #t = :f, scrubbed = :y',
      ExpressionAttributeNames: { '#t': 'text' },
      ExpressionAttributeValues: { ':f': '[forgotten]', ':y': true },
    }));
  }
}
