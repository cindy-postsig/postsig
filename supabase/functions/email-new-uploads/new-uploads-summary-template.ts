const newUploadsSummaryTemplate = `
<div
  style="
    font-family: 'Open Sans', sans-serif;
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 5px;
    max-width: 800px;
    margin: auto;
  "
>
  <h2 style="text-align: center; color: #333333; margin-bottom: 20px">
    Hourly uploads summary {{ env }}
  </h2>
  <p style="margin-bottom: 20px">
    Users from following organizations have uploaded contracts in the past hour
  </p>
  {{ #summary }}
  <section style="margin-bottom: 20px">
  <strong style="font-size: 16px; color: #333333">{{ orgName }}</strong>
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px">
      <tr style="background-color: #f1f1f1">
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 40%">
          User ID
        </th>
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          User Name
        </th>
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          Number of contracts
        </th>
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          Failed Contracts
        </th>
      </tr>
      {{ #data }}
      <tr>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 40%">{{ uid }}</td>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ username }}</td>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ count }}</td>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ failedCount }}</td>
      </tr>
      {{ /data }}
    </table>
  </section>
  {{ /summary }}
  {{ #isFailed }}
  <section style="margin-bottom: 20px">
    <p style="margin-top: 20px">
    ⚠️ Following contracts have failed AI extraction: 
    </p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px">
      <tr style="background-color: #f1f1f1">
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          Contract ID
        </th>
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          User ID
        </th>
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          User Name
        </th>
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          Organization Name
        </th>
        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; width: 20%">
          Document File Name
        </th>
      </tr>
      {{ #data }}
      <tr>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ contractId }}</td>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ uid }}</td>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ username }}</td>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ orgName }}</td>
        <td style="padding: 10px; border: 1px solid #dddddd; width: 20%">{{ docFileName }}</td>
      </tr>
      {{ /data }}
    </table>
  </section>
  {{ /isFailed }}
  {{ ^isFailed }}
  <section style="margin-bottom: 20px">
    <p>All uploaded contracts have been successfully extracted by the AI ✅</p>
  </section>
  {{ /isFailed }}
</div>
`;

export default newUploadsSummaryTemplate;
